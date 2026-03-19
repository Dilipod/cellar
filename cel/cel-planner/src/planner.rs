/// The planner: observe-plan-act-verify loop.
///
/// Takes a goal and uses an LLM to decompose it into steps,
/// one at a time, based on the current screen context.
///
/// Integrates browser-use learnings:
/// - Grounding validation (element ID existence, blocking error detection)
/// - Empty context recovery (retry on sparse/empty screens)
/// - Loop detection (repeat, ping-pong, stale context)
/// - Step budget awareness (passed to prompt)

use async_trait::async_trait;
use cel_context::ScreenContext;

use crate::error::PlannerError;
use crate::history::StepHistory;
use crate::loop_detector::{context_fingerprint, LoopDetector, LoopSignal};
use crate::prompt::{self, PromptOptions};
use crate::types::*;

/// Minimum number of actionable (enabled + visible) elements before retrying context.
const MIN_ACTIONABLE_ELEMENTS: usize = 3;
/// Maximum retries for empty/sparse context.
const EMPTY_CONTEXT_MAX_RETRIES: u32 = 3;
/// Base delay between empty-context retries in milliseconds.
const EMPTY_CONTEXT_BASE_DELAY_MS: u64 = 500;
/// How many grace steps after a loop warning before auto-failing.
const LOOP_GRACE_STEPS: u32 = 2;

/// Trait the caller implements to provide screen context and execute actions.
///
/// The planner is a pure decision-maker. Execution is the caller's responsibility.
/// This keeps the planner testable without real input devices and adapter-agnostic.
#[async_trait]
pub trait PlannerBackend: Send + Sync {
    /// Get the current screen context.
    async fn get_context(&self) -> Result<ScreenContext, PlannerError>;

    /// Execute a planned action.
    /// Returns Ok(true) on success, Ok(false) on non-fatal failure.
    async fn execute(&self, action: &PlannedAction) -> Result<bool, PlannerError>;

    /// Called for each PlannerEvent (logging, UI updates, etc.).
    fn on_event(&self, event: PlannerEvent);
}

/// The planner orchestrates the observe-plan-act loop.
pub struct Planner {
    llm: cel_llm::LlmClient,
    config: GoalConfig,
}

impl Planner {
    pub fn new(llm: cel_llm::LlmClient, config: GoalConfig) -> Self {
        Self { llm, config }
    }

    /// Run the full observe-plan-act-verify loop until Done, Fail, or max steps.
    pub async fn run(
        &self,
        backend: &dyn PlannerBackend,
    ) -> Result<PlannerEvent, PlannerError> {
        let mut history = StepHistory::new();
        let mut loop_detector = LoopDetector::new();
        let mut loop_warning: Option<String> = None;
        let mut tentative_plan: Vec<PlannedStep> = Vec::new();
        let system = prompt::system_prompt();

        for step_index in 0..self.config.max_steps {
            // 1. OBSERVE — get context with empty-context recovery
            let context = self
                .get_context_with_retry(backend, step_index)
                .await?;

            // 2. PLAN — try tentative cache first, otherwise call LLM
            let step = if let Some(cached) = tentative_plan.first() {
                // Check if cached step's expected context matches current
                if self.context_matches_expectation(cached, &context) {
                    let s = tentative_plan.remove(0);
                    tracing::info!(step = step_index, "Using cached tentative step");
                    s
                } else {
                    // Context diverged — discard plan and re-plan
                    tracing::info!(step = step_index, "Context diverged — clearing tentative plan");
                    tentative_plan.clear();
                    self.plan_step(&system, &context, &history, step_index, &loop_warning, backend).await?
                }
            } else {
                self.plan_step(&system, &context, &history, step_index, &loop_warning, backend).await?
            };

            backend.on_event(PlannerEvent::StepPlanned {
                step_index,
                step: step.clone(),
            });

            tracing::info!(
                step = step_index,
                action = ?step.action,
                confidence = step.confidence,
                "Planned step"
            );

            // 3. GROUNDING VALIDATION — verify element IDs exist in context
            if let Some(rejection) = self.validate_grounding(&step, &context) {
                backend.on_event(PlannerEvent::GroundingRejected {
                    step_index,
                    reason: rejection.clone(),
                });
                tracing::warn!(step = step_index, reason = %rejection, "Grounding rejected");
                // Record as a failed step so the LLM can self-correct
                history.record(
                    step_index,
                    step.action.clone(),
                    false,
                    Some(format!("Grounding validation: {}", rejection)),
                );
                // Clear loop warning since we injected a synthetic failure
                loop_warning = None;
                // Brief pause then continue to next step
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                continue;
            }

            // 4. CHECK for terminal actions
            match &step.action {
                PlannedAction::Done { summary, .. } => {
                    let event = PlannerEvent::GoalAchieved {
                        summary: summary.clone(),
                        total_steps: step_index,
                    };
                    backend.on_event(event.clone());
                    return Ok(event);
                }
                PlannedAction::Fail { reason } => {
                    let event = PlannerEvent::GoalFailed {
                        reason: reason.clone(),
                        total_steps: step_index,
                    };
                    backend.on_event(event.clone());
                    return Ok(event);
                }
                _ => {}
            }

            // 5. ACT
            let result = backend.execute(&step.action).await;
            let (success, error) = match result {
                Ok(true) => (true, None),
                Ok(false) => (false, Some("Action returned false".to_string())),
                Err(e) => (false, Some(e.to_string())),
            };

            backend.on_event(PlannerEvent::StepExecuted {
                step_index,
                success,
                error: error.clone(),
            });

            // 6. RECORD for next iteration
            history.record(step_index, step.action.clone(), success, error);

            // 7. LOOP DETECTION
            let ctx_hash = context_fingerprint(&context);
            let signal = loop_detector.check(&step.action, ctx_hash);

            match signal {
                LoopSignal::None => {
                    loop_warning = None;
                }
                _ => {
                    let signal_str = signal.to_string();
                    backend.on_event(PlannerEvent::LoopDetected {
                        step_index,
                        signal: signal_str.clone(),
                    });
                    tracing::warn!(step = step_index, signal = %signal_str, "Loop detected");

                    if loop_detector.should_auto_fail() {
                        let event = PlannerEvent::GoalFailed {
                            reason: format!("Stuck in action loop: {}", signal_str),
                            total_steps: step_index,
                        };
                        backend.on_event(event.clone());
                        return Ok(event);
                    }

                    if loop_warning.is_none() {
                        // First detection — set warning and start grace period
                        loop_warning = Some(signal_str);
                        loop_detector.start_grace(LOOP_GRACE_STEPS);
                    }
                }
            }

            // Brief pause to let the UI settle
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }

        Err(PlannerError::MaxStepsExceeded {
            max_steps: self.config.max_steps,
        })
    }

    /// Build prompt and call LLM for a single step.
    async fn plan_step(
        &self,
        system: &str,
        context: &ScreenContext,
        history: &StepHistory,
        step_index: u32,
        loop_warning: &Option<String>,
        backend: &dyn PlannerBackend,
    ) -> Result<PlannedStep, PlannerError> {
        let opts = PromptOptions {
            step_index,
            max_steps: self.config.max_steps,
            loop_warning: loop_warning.as_deref(),
            context_detail: self.config.context_detail,
            ..Default::default()
        };
        let user = prompt::build_user_prompt(&self.config.goal, context, history, &opts);
        self.call_llm_with_retries(system, &user, step_index, backend).await
    }

    /// Check whether a cached step's expected outcome roughly matches the current context.
    /// Uses a simple heuristic: same app + window title.
    fn context_matches_expectation(&self, step: &PlannedStep, context: &ScreenContext) -> bool {
        // If the step targets a specific element, check it exists
        match &step.action {
            PlannedAction::Click { target_id } | PlannedAction::Type { target_id, .. } => {
                context.elements.iter().any(|el| el.id == *target_id)
            }
            // Non-targeted actions (key, scroll, wait) are always compatible
            _ => true,
        }
    }

    /// Get context with retry on empty/sparse screens.
    async fn get_context_with_retry(
        &self,
        backend: &dyn PlannerBackend,
        step_index: u32,
    ) -> Result<ScreenContext, PlannerError> {
        for retry in 0..=EMPTY_CONTEXT_MAX_RETRIES {
            let context = backend.get_context().await?;
            let actionable = context
                .elements
                .iter()
                .filter(|el| el.state.enabled && el.state.visible)
                .count();

            if actionable >= MIN_ACTIONABLE_ELEMENTS || retry == EMPTY_CONTEXT_MAX_RETRIES {
                return Ok(context);
            }

            backend.on_event(PlannerEvent::EmptyContextRetry {
                step_index,
                actionable_count: actionable,
                retry_attempt: retry + 1,
            });

            tracing::info!(
                step = step_index,
                actionable,
                retry = retry + 1,
                "Empty context — retrying"
            );

            let delay = EMPTY_CONTEXT_BASE_DELAY_MS * (1 << retry); // 500, 1000, 2000
            tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
        }

        unreachable!() // Loop always returns on last retry
    }

    fn validate_grounding(
        &self,
        step: &PlannedStep,
        context: &ScreenContext,
    ) -> Option<String> {
        validate_grounding(step, context)
    }
}

// -----------------------------------------------------------------------
// Grounding validation — extracted as module-level functions for testability
// -----------------------------------------------------------------------

/// Validate that a planned step references real elements and doesn't
/// claim "done" while blocking errors are visible.
pub fn validate_grounding(step: &PlannedStep, context: &ScreenContext) -> Option<String> {
    match &step.action {
        PlannedAction::Click { target_id } | PlannedAction::Type { target_id, .. } => {
            let exists = context.elements.iter().any(|el| el.id == *target_id);
            if !exists {
                let available: Vec<_> = context
                    .elements
                    .iter()
                    .take(10)
                    .map(|el| el.id.as_str())
                    .collect();
                return Some(format!(
                    "Element ID '{}' not found in context. Available: [{}]",
                    target_id,
                    available.join(", ")
                ));
            }
        }
        PlannedAction::Done { evidence_ids, .. } => {
            if let Some(blocker) = find_blocking_error(context) {
                return Some(format!(
                    "Cannot claim done — blocking indicator found: {}",
                    blocker
                ));
            }
            for eid in evidence_ids {
                if !context.elements.iter().any(|el| el.id == *eid) {
                    return Some(format!(
                        "Evidence element '{}' not found in context",
                        eid
                    ));
                }
            }
        }
        _ => {}
    }
    None
}

/// Check for blocking errors in context (HTTP errors, error labels).
pub fn find_blocking_error(context: &ScreenContext) -> Option<String> {
    for event in &context.network_events {
        if let Some(status) = event.status {
            if status >= 400 {
                return Some(format!(
                    "HTTP {} on {}",
                    status,
                    truncate_str(&event.url, 50)
                ));
            }
        }
    }
    let error_keywords = ["error", "failed", "denied", "forbidden", "unauthorized"];
    for el in &context.elements {
        if let Some(label) = &el.label {
            let lower = label.to_lowercase();
            for kw in &error_keywords {
                if lower.contains(kw) && el.state.visible {
                    return Some(format!("Error element visible: '{}' ({})", label, el.id));
                }
            }
        }
    }
    None
}

impl Planner {

    /// Call the LLM with retry logic for parse failures.
    async fn call_llm_with_retries(
        &self,
        system_prompt: &str,
        user_prompt: &str,
        step_index: u32,
        backend: &dyn PlannerBackend,
    ) -> Result<PlannedStep, PlannerError> {
        let mut last_output = String::new();

        for attempt in 0..self.config.max_retries {
            let raw = self
                .llm
                .complete(system_prompt, user_prompt, self.config.max_tokens)
                .await?;

            let cleaned = cel_llm::strip_code_fences(&raw);

            match serde_json::from_str::<PlannedStep>(cleaned) {
                Ok(step) => return Ok(step),
                Err(e) => {
                    tracing::warn!(
                        attempt = attempt + 1,
                        max = self.config.max_retries,
                        error = %e,
                        raw_len = raw.len(),
                        "LLM output parse failed"
                    );
                    last_output = raw.clone();
                    backend.on_event(PlannerEvent::ParseRetry {
                        step_index,
                        attempt: attempt + 1,
                        raw_output: raw,
                    });
                }
            }
        }

        Err(PlannerError::ParseFailed {
            attempts: self.config.max_retries,
            last_output: if last_output.len() > 500 {
                format!("{}...", &last_output[..500])
            } else {
                last_output
            },
        })
    }
}

fn truncate_str(s: &str, max: usize) -> &str {
    if s.len() <= max {
        s
    } else {
        &s[..max]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cel_context::{ContextElement, ContextSource, ElementState};
    use cel_network::NetworkEvent;

    fn make_element(id: &str, etype: &str, label: &str) -> ContextElement {
        ContextElement {
            id: id.into(),
            label: Some(label.into()),
            description: None,
            element_type: etype.into(),
            value: None,
            bounds: None,
            state: ElementState {
                focused: false,
                enabled: true,
                visible: true,
                selected: false,
                expanded: None,
                checked: None,
            },
            parent_id: None,
            actions: vec!["click".into()],
            confidence: 0.9,
            source: ContextSource::AccessibilityTree,
        }
    }

    fn make_context(elements: Vec<ContextElement>) -> ScreenContext {
        ScreenContext {
            app: "Test".into(),
            window: "Test Window".into(),
            elements,
            network_events: vec![],
            timestamp_ms: 1000,
        }
    }

    fn make_step(action: PlannedAction) -> PlannedStep {
        PlannedStep {
            reasoning: "test".into(),
            action,
            expected_outcome: "test".into(),
            confidence: 0.9,
        }
    }

    #[test]
    fn test_planner_construction() {
        let config = GoalConfig::new("Test goal");
        assert_eq!(config.goal, "Test goal");
        assert_eq!(config.max_steps, 50);
        assert_eq!(config.max_retries, 3);
        assert_eq!(config.max_tokens, 2048);
        assert_eq!(config.context_detail, ContextDetail::Full);
    }

    // --- Grounding validation tests ---

    #[test]
    fn test_grounding_accepts_valid_click() {
        let ctx = make_context(vec![make_element("btn1", "button", "Submit")]);
        let step = make_step(PlannedAction::Click { target_id: "btn1".into() });
        assert!(validate_grounding(&step, &ctx).is_none());
    }

    #[test]
    fn test_grounding_rejects_missing_click_target() {
        let ctx = make_context(vec![make_element("btn1", "button", "Submit")]);
        let step = make_step(PlannedAction::Click { target_id: "nonexistent".into() });
        let result = validate_grounding(&step, &ctx);
        assert!(result.is_some());
        assert!(result.unwrap().contains("not found in context"));
    }

    #[test]
    fn test_grounding_rejects_missing_type_target() {
        let ctx = make_context(vec![]);
        let step = make_step(PlannedAction::Type {
            target_id: "input1".into(),
            text: "hello".into(),
        });
        assert!(validate_grounding(&step, &ctx).is_some());
    }

    #[test]
    fn test_grounding_accepts_done_without_errors() {
        let ctx = make_context(vec![make_element("msg", "text", "Welcome!")]);
        let step = make_step(PlannedAction::Done {
            summary: "Logged in".into(),
            evidence_ids: vec!["msg".into()],
        });
        assert!(validate_grounding(&step, &ctx).is_none());
    }

    #[test]
    fn test_grounding_rejects_done_with_missing_evidence() {
        let ctx = make_context(vec![make_element("msg", "text", "Welcome!")]);
        let step = make_step(PlannedAction::Done {
            summary: "Done".into(),
            evidence_ids: vec!["nonexistent".into()],
        });
        let result = validate_grounding(&step, &ctx);
        assert!(result.is_some());
        assert!(result.unwrap().contains("Evidence element"));
    }

    #[test]
    fn test_grounding_accepts_done_without_evidence_ids() {
        // Empty evidence_ids should be accepted (backwards compatible)
        let ctx = make_context(vec![]);
        let step = make_step(PlannedAction::Done {
            summary: "Done".into(),
            evidence_ids: vec![],
        });
        assert!(validate_grounding(&step, &ctx).is_none());
    }

    #[test]
    fn test_grounding_rejects_done_with_error_element() {
        let ctx = make_context(vec![
            make_element("err", "text", "Error: Login failed"),
        ]);
        let step = make_step(PlannedAction::Done {
            summary: "Logged in".into(),
            evidence_ids: vec![],
        });
        let result = validate_grounding(&step, &ctx);
        assert!(result.is_some());
        assert!(result.unwrap().contains("blocking indicator"));
    }

    #[test]
    fn test_grounding_allows_non_targeted_actions() {
        let ctx = make_context(vec![]);
        // Key, scroll, wait don't need target validation
        assert!(validate_grounding(
            &make_step(PlannedAction::Key { key: "Enter".into() }),
            &ctx,
        ).is_none());
        assert!(validate_grounding(
            &make_step(PlannedAction::Scroll { dx: 0, dy: -3 }),
            &ctx,
        ).is_none());
    }

    // --- Blocking error detection ---

    #[test]
    fn test_find_blocking_http_error() {
        let mut ctx = make_context(vec![]);
        ctx.network_events = vec![NetworkEvent {
            url: "https://api.example.com/login".into(),
            method: Some("POST".into()),
            status: Some(403),
            content_type: None,
            timestamp_ms: 1000,
            body_size: None,
            source_port: None,
            dest_port: None,
            state: None,
        }];
        let result = find_blocking_error(&ctx);
        assert!(result.is_some());
        assert!(result.unwrap().contains("HTTP 403"));
    }

    #[test]
    fn test_find_blocking_error_label() {
        let ctx = make_context(vec![
            make_element("err", "div", "Access Denied"),
        ]);
        let result = find_blocking_error(&ctx);
        assert!(result.is_some());
        assert!(result.unwrap().contains("Access Denied"));
    }

    #[test]
    fn test_no_blocking_error_on_clean_context() {
        let mut ctx = make_context(vec![
            make_element("btn", "button", "Submit"),
        ]);
        ctx.network_events = vec![NetworkEvent {
            url: "https://api.example.com/data".into(),
            method: Some("GET".into()),
            status: Some(200),
            content_type: None,
            timestamp_ms: 1000,
            body_size: None,
            source_port: None,
            dest_port: None,
            state: None,
        }];
        assert!(find_blocking_error(&ctx).is_none());
    }

    #[test]
    fn test_hidden_error_not_blocking() {
        let mut el = make_element("err", "div", "Error occurred");
        el.state.visible = false;
        let ctx = make_context(vec![el]);
        assert!(find_blocking_error(&ctx).is_none());
    }
}
