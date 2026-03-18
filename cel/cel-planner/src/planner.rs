/// The planner: observe-plan-act-verify loop.
///
/// Takes a goal and uses an LLM to decompose it into steps,
/// one at a time, based on the current screen context.

use async_trait::async_trait;
use cel_context::ScreenContext;

use crate::error::PlannerError;
use crate::history::StepHistory;
use crate::prompt;
use crate::types::*;

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
        let system = prompt::system_prompt();

        for step_index in 0..self.config.max_steps {
            // 1. OBSERVE
            let context = backend.get_context().await?;

            // 2. PLAN
            let user = prompt::build_user_prompt(&self.config.goal, &context, &history);

            let step = self
                .call_llm_with_retries(&system, &user, step_index, backend)
                .await?;

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

            // 3. CHECK for terminal actions
            match &step.action {
                PlannedAction::Done { summary } => {
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

            // 4. ACT
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

            // 5. RECORD for next iteration
            history.record(step_index, step.action.clone(), success, error);

            // Brief pause to let the UI settle
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }

        Err(PlannerError::MaxStepsExceeded {
            max_steps: self.config.max_steps,
        })
    }

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

#[cfg(test)]
mod tests {
    use super::*;

    // Verify the Planner struct can be constructed
    #[test]
    fn test_planner_construction() {
        // We can't construct a real LlmClient without env vars,
        // but we can verify the GoalConfig defaults
        let config = GoalConfig::new("Test goal");
        assert_eq!(config.goal, "Test goal");
        assert_eq!(config.max_steps, 50);
        assert_eq!(config.max_retries, 3);
        assert_eq!(config.max_tokens, 2048);
    }
}
