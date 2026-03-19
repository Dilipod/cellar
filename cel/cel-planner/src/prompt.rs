/// LLM prompt construction for the CEL planner.
///
/// Serializes ScreenContext elements into a compact table format
/// that the LLM can reason about, along with step history and goal.
///
/// Integrates learnings from browser-use OSS:
/// - Data grounding rules (anti-hallucination)
/// - Password field redaction
/// - Step budget awareness
/// - Visibility filtering (hidden elements omitted)
/// - Compact/ActionableOnly context modes
/// - Loop warning injection

use cel_context::ScreenContext;

use crate::history::StepHistory;
use crate::types::{ContextDetail, PlannedAction};

/// Default maximum elements to include in the prompt (already sorted by confidence).
const DEFAULT_MAX_ELEMENTS: usize = 40;

/// Default maximum recent steps to include in history.
const DEFAULT_MAX_HISTORY_STEPS: usize = 10;

/// The system prompt that defines the LLM's role and output schema.
pub fn system_prompt() -> String {
    r#"You are a UI automation agent. You interact with desktop and web applications by observing UI elements and deciding what action to take next.

## Rules
1. You are given a GOAL and the current SCREEN CONTEXT (visible UI elements).
2. Return exactly ONE action as a JSON object with the schema below.
3. Pick the element most likely to advance the goal. Use the element ID from the context.
4. If the goal is achieved, return a "done" action with evidence_ids.
5. If the goal cannot be achieved (missing elements, error state), return a "fail" action.
6. Never invent element IDs. Only use IDs listed in the UI Elements table.
7. If a previous step failed, try a DIFFERENT approach — do not repeat the same action.
8. When returning "done", include evidence_ids listing element IDs from the context that prove the goal was achieved (e.g. a success message, the expected content visible on screen).
9. If you see error messages, HTTP 4xx/5xx responses, or blocking dialogs (cookie walls, login prompts, CAPTCHAs), do NOT return "done". Address the blocker or return "fail".
10. Base all claims on data visible in the context. Never fabricate or assume information not shown.

## Response Schema (JSON)
{
  "reasoning": "Brief explanation of why this action",
  "action": { "type": "click", "target_id": "element-id-here" },
  "expected_outcome": "What should happen after this step",
  "confidence": 0.85
}

## Action Types
- {"type": "click", "target_id": "..."} — Click on an element
- {"type": "type", "target_id": "...", "text": "..."} — Click element then type text
- {"type": "key", "key": "Enter"} — Press a key (Enter, Tab, Escape, etc.)
- {"type": "key_combo", "keys": ["Ctrl", "S"]} — Key combination
- {"type": "scroll", "dx": 0, "dy": -3} — Scroll (negative dy = scroll up)
- {"type": "wait", "ms": 1000} — Wait for UI to settle
- {"type": "custom", "adapter": "...", "action": "...", "params": {...}} — Adapter-specific
- {"type": "done", "summary": "Goal achieved: ...", "evidence_ids": ["id1", "id2"]} — Goal complete with proof
- {"type": "fail", "reason": "Cannot proceed because ..."} — Goal impossible

Respond ONLY with valid JSON. No explanation outside the JSON."#
        .to_string()
}

/// Options for building the user prompt.
#[derive(Debug, Clone, Default)]
pub struct PromptOptions<'a> {
    /// Current step index (0-based).
    pub step_index: u32,
    /// Maximum steps allowed.
    pub max_steps: u32,
    /// Optional loop warning to inject.
    pub loop_warning: Option<&'a str>,
    /// How much detail to include in the element table.
    pub context_detail: ContextDetail,
    /// Maximum elements to include (0 = use default).
    pub max_elements: usize,
    /// Maximum history steps to include (0 = use default).
    pub max_history_steps: usize,
    /// Maximum network events to include (0 = omit).
    pub max_network_events: usize,
}

/// Build the user prompt with current context and step history.
///
/// Accepts `PromptOptions` for budget awareness, loop warnings, and context detail.
pub fn build_user_prompt(
    goal: &str,
    context: &ScreenContext,
    history: &StepHistory,
    opts: &PromptOptions,
) -> String {
    let mut prompt = String::with_capacity(4096);

    // Goal
    prompt.push_str(&format!("## Goal\n{}\n\n", goal));

    // Step budget
    if opts.max_steps > 0 {
        let remaining = opts.max_steps.saturating_sub(opts.step_index + 1);
        prompt.push_str(&format!(
            "## Budget\nStep {} of {}. {} steps remaining.",
            opts.step_index + 1,
            opts.max_steps,
            remaining,
        ));
        if remaining < 5 {
            prompt.push_str(
                " URGENT: Running low on steps. Complete the goal now or fail gracefully.",
            );
        }
        prompt.push_str("\n\n");
    }

    // Current screen
    prompt.push_str(&format!(
        "## Current Screen\nApp: {} | Window: {}\n\n",
        context.app, context.window
    ));

    // Resolve configurable limits (0 = use defaults)
    let max_elements = if opts.max_elements > 0 { opts.max_elements } else { DEFAULT_MAX_ELEMENTS };
    let max_history = if opts.max_history_steps > 0 { opts.max_history_steps } else { DEFAULT_MAX_HISTORY_STEPS };
    let max_network = if opts.max_network_events > 0 { opts.max_network_events } else { 5 };

    // Filter elements: always exclude hidden, apply context_detail mode
    let visible: Vec<_> = context
        .elements
        .iter()
        .filter(|el| el.state.visible)
        .collect();

    let elements: Vec<_> = match opts.context_detail {
        ContextDetail::ActionableOnly => visible
            .into_iter()
            .filter(|el| el.state.enabled && !el.actions.is_empty())
            .take(max_elements)
            .collect(),
        _ => visible.into_iter().take(max_elements).collect(),
    };

    let total_visible = context.elements.iter().filter(|el| el.state.visible).count();

    // Elements table
    prompt.push_str("## UI Elements\n");
    match opts.context_detail {
        ContextDetail::Compact | ContextDetail::ActionableOnly => {
            prompt.push_str("| ID | Type | Label |\n");
            prompt.push_str("|-----|------|-------|\n");
            for el in &elements {
                let label = el.label.as_deref().unwrap_or("-");
                prompt.push_str(&format!(
                    "| {} | {} | {} |\n",
                    el.id,
                    el.element_type,
                    truncate(label, 40),
                ));
            }
        }
        ContextDetail::Full => {
            prompt.push_str("| ID | Type | Label | Value | State | Actions |\n");
            prompt.push_str("|-----|------|-------|-------|-------|--------|\n");
            for el in &elements {
                let label = el.label.as_deref().unwrap_or("-");
                // Redact password field values
                let value = if el.element_type.contains("password") {
                    "****"
                } else {
                    el.value.as_deref().unwrap_or("-")
                };
                let state = format_state(&el.state);
                let actions = if el.actions.is_empty() {
                    "-".to_string()
                } else {
                    el.actions.join(", ")
                };
                prompt.push_str(&format!(
                    "| {} | {} | {} | {} | {} | {} |\n",
                    el.id,
                    el.element_type,
                    truncate(label, 30),
                    truncate(value, 20),
                    state,
                    actions,
                ));
            }
        }
    }

    if total_visible > elements.len() {
        prompt.push_str(&format!(
            "\n({} more elements not shown)\n",
            total_visible - elements.len()
        ));
    }
    prompt.push('\n');

    // Network events (if any, and if max_network > 0)
    if !context.network_events.is_empty() && max_network > 0 {
        prompt.push_str("## Recent Network\n");
        for event in context.network_events.iter().take(max_network) {
            let method = event.method.as_deref().unwrap_or("?");
            let status = event
                .status
                .map(|s| s.to_string())
                .unwrap_or_else(|| "?".to_string());
            prompt.push_str(&format!(
                "- {} {} → {}\n",
                method,
                truncate(&event.url, 60),
                status,
            ));
        }
        prompt.push('\n');
    }

    // Step history (compacted summary + recent steps)
    if let Some(summary) = history.compacted_summary() {
        prompt.push_str("## Earlier Steps (Summary)\n");
        prompt.push_str(summary);
        prompt.push_str("\n\n");
    }

    let recent = history.recent(max_history);
    if !recent.is_empty() {
        prompt.push_str("## Previous Steps\n");
        for step in recent {
            let status = if step.success { "OK" } else { "FAILED" };
            let action_summary = summarize_action(&step.action);
            let err = step.error.as_deref().unwrap_or("");
            prompt.push_str(&format!(
                "{}. [{}] {}",
                step.step_index + 1,
                status,
                action_summary,
            ));
            if !err.is_empty() {
                prompt.push_str(&format!(" ({})", err));
            }
            prompt.push('\n');
        }
        prompt.push('\n');
    }

    // Loop warning (injected by loop detector)
    if let Some(warning) = opts.loop_warning {
        prompt.push_str("## WARNING\n");
        prompt.push_str(warning);
        prompt.push_str(
            "\nYou MUST try a completely different approach. Do NOT repeat the same action.\n\n",
        );
    }

    prompt.push_str("## Your Next Step\nRespond with ONE action as JSON.\n");
    prompt
}

/// Format element state as compact flags.
fn format_state(state: &cel_context::ElementState) -> String {
    let mut flags = Vec::new();
    if state.focused {
        flags.push("focused");
    }
    if !state.enabled {
        flags.push("disabled");
    }
    if !state.visible {
        flags.push("hidden");
    }
    if state.selected {
        flags.push("selected");
    }
    if state.expanded == Some(true) {
        flags.push("expanded");
    }
    if state.checked == Some(true) {
        flags.push("checked");
    }
    if flags.is_empty() {
        "normal".to_string()
    } else {
        flags.join(",")
    }
}

/// Truncate a string to max characters.
fn truncate(s: &str, max: usize) -> &str {
    if s.len() <= max {
        s
    } else {
        &s[..max]
    }
}

/// Summarize a PlannedAction for history display.
fn summarize_action(action: &PlannedAction) -> String {
    match action {
        PlannedAction::Click { target_id } => format!("click({})", target_id),
        PlannedAction::Type { target_id, text } => {
            format!("type({}, \"{}\")", target_id, truncate(text, 20))
        }
        PlannedAction::Key { key } => format!("key({})", key),
        PlannedAction::KeyCombo { keys } => format!("combo({})", keys.join("+")),
        PlannedAction::Scroll { dx, dy } => format!("scroll({},{})", dx, dy),
        PlannedAction::Wait { ms } => format!("wait({}ms)", ms),
        PlannedAction::Custom { adapter, action, .. } => {
            format!("custom({}.{})", adapter, action)
        }
        PlannedAction::Done { summary, .. } => format!("DONE: {}", truncate(summary, 40)),
        PlannedAction::Fail { reason } => format!("FAIL: {}", truncate(reason, 40)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cel_context::{ContextElement, ContextSource, ElementState};

    fn make_context(elements: Vec<ContextElement>) -> ScreenContext {
        ScreenContext {
            app: "TestApp".into(),
            window: "Test Window".into(),
            elements,
            network_events: vec![],
            timestamp_ms: 1000,
        }
    }

    fn make_element(id: &str, element_type: &str, label: &str) -> ContextElement {
        ContextElement {
            id: id.into(),
            label: Some(label.into()),
            description: None,
            element_type: element_type.into(),
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
            source: ContextSource::NativeApi,
        }
    }

    fn default_opts() -> PromptOptions<'static> {
        PromptOptions {
            step_index: 0,
            max_steps: 30,
            ..Default::default()
        }
    }

    #[test]
    fn test_system_prompt_contains_schema() {
        let prompt = system_prompt();
        assert!(prompt.contains("reasoning"));
        assert!(prompt.contains("action"));
        assert!(prompt.contains("expected_outcome"));
        assert!(prompt.contains("confidence"));
        assert!(prompt.contains("done"));
        assert!(prompt.contains("fail"));
        assert!(prompt.contains("evidence_ids"));
    }

    #[test]
    fn test_system_prompt_contains_grounding_rules() {
        let prompt = system_prompt();
        assert!(prompt.contains("Never invent element IDs"));
        assert!(prompt.contains("evidence_ids listing element IDs"));
        assert!(prompt.contains("error messages, HTTP 4xx/5xx"));
        assert!(prompt.contains("Never fabricate"));
    }

    #[test]
    fn test_user_prompt_contains_goal() {
        let context = make_context(vec![]);
        let history = StepHistory::new();
        let prompt = build_user_prompt("Log in to admin", &context, &history, &default_opts());
        assert!(prompt.contains("Log in to admin"));
    }

    #[test]
    fn test_user_prompt_contains_app_info() {
        let context = make_context(vec![]);
        let history = StepHistory::new();
        let prompt = build_user_prompt("test", &context, &history, &default_opts());
        assert!(prompt.contains("TestApp"));
        assert!(prompt.contains("Test Window"));
    }

    #[test]
    fn test_user_prompt_contains_elements() {
        let context = make_context(vec![
            make_element("dom:submit", "button", "Submit"),
            make_element("dom:email", "input", "Email"),
        ]);
        let history = StepHistory::new();
        let prompt = build_user_prompt("test", &context, &history, &default_opts());
        assert!(prompt.contains("dom:submit"));
        assert!(prompt.contains("dom:email"));
        assert!(prompt.contains("button"));
        assert!(prompt.contains("input"));
        assert!(prompt.contains("Submit"));
        assert!(prompt.contains("Email"));
    }

    #[test]
    fn test_user_prompt_contains_history() {
        let context = make_context(vec![]);
        let mut history = StepHistory::new();
        history.record(
            0,
            PlannedAction::Click {
                target_id: "btn1".into(),
            },
            true,
            None,
        );
        history.record(
            1,
            PlannedAction::Type {
                target_id: "inp".into(),
                text: "hello".into(),
            },
            false,
            Some("Element not found".into()),
        );
        let prompt = build_user_prompt("test", &context, &history, &default_opts());
        assert!(prompt.contains("[OK] click(btn1)"));
        assert!(prompt.contains("[FAILED] type(inp"));
        assert!(prompt.contains("Element not found"));
    }

    #[test]
    fn test_user_prompt_limits_elements() {
        let elements: Vec<ContextElement> = (0..60)
            .map(|i| make_element(&format!("el{}", i), "button", &format!("Btn {}", i)))
            .collect();
        let context = make_context(elements);
        let history = StepHistory::new();
        let prompt = build_user_prompt("test", &context, &history, &default_opts());
        // Should contain the overflow notice
        assert!(prompt.contains("20 more elements not shown"));
        // Should contain early elements but not late ones
        assert!(prompt.contains("el0"));
        assert!(prompt.contains("el39"));
        assert!(!prompt.contains("| el40 |"));
    }

    #[test]
    fn test_budget_shown() {
        let context = make_context(vec![]);
        let history = StepHistory::new();
        let opts = PromptOptions {
            step_index: 5,
            max_steps: 30,
            ..default_opts()
        };
        let prompt = build_user_prompt("test", &context, &history, &opts);
        assert!(prompt.contains("Step 6 of 30"));
        assert!(prompt.contains("24 steps remaining"));
    }

    #[test]
    fn test_budget_urgent_when_low() {
        let context = make_context(vec![]);
        let history = StepHistory::new();
        let opts = PromptOptions {
            step_index: 27,
            max_steps: 30,
            ..default_opts()
        };
        let prompt = build_user_prompt("test", &context, &history, &opts);
        assert!(prompt.contains("URGENT"));
        assert!(prompt.contains("2 steps remaining"));
    }

    #[test]
    fn test_loop_warning_injected() {
        let context = make_context(vec![]);
        let history = StepHistory::new();
        let opts = PromptOptions {
            loop_warning: Some("Repeated click(btn) 3 times."),
            ..default_opts()
        };
        let prompt = build_user_prompt("test", &context, &history, &opts);
        assert!(prompt.contains("## WARNING"));
        assert!(prompt.contains("Repeated click(btn) 3 times."));
        assert!(prompt.contains("completely different approach"));
    }

    #[test]
    fn test_hidden_elements_excluded() {
        let mut hidden = make_element("dom:hidden", "div", "Hidden");
        hidden.state.visible = false;
        let visible = make_element("dom:visible", "button", "Visible");
        let context = make_context(vec![hidden, visible]);
        let history = StepHistory::new();
        let prompt = build_user_prompt("test", &context, &history, &default_opts());
        assert!(!prompt.contains("dom:hidden"));
        assert!(prompt.contains("dom:visible"));
    }

    #[test]
    fn test_password_values_redacted() {
        let mut pw = make_element("dom:pw", "password", "Password");
        pw.value = Some("secret123".into());
        let mut txt = make_element("dom:txt", "input", "Name");
        txt.value = Some("John".into());
        let context = make_context(vec![pw, txt]);
        let history = StepHistory::new();
        let prompt = build_user_prompt("test", &context, &history, &default_opts());
        assert!(prompt.contains("****"));
        assert!(!prompt.contains("secret123"));
        assert!(prompt.contains("John"));
    }

    #[test]
    fn test_compact_mode() {
        let context = make_context(vec![
            make_element("btn1", "button", "Submit"),
        ]);
        let history = StepHistory::new();
        let opts = PromptOptions {
            context_detail: ContextDetail::Compact,
            ..default_opts()
        };
        let prompt = build_user_prompt("test", &context, &history, &opts);
        assert!(prompt.contains("| ID | Type | Label |"));
        // Should NOT have Value/State/Actions columns
        assert!(!prompt.contains("| Value |"));
        assert!(!prompt.contains("| State |"));
    }

    #[test]
    fn test_actionable_only_mode() {
        let mut no_actions = make_element("text1", "text", "Static text");
        no_actions.actions = vec![];
        let with_actions = make_element("btn1", "button", "Click me");
        let context = make_context(vec![no_actions, with_actions]);
        let history = StepHistory::new();
        let opts = PromptOptions {
            context_detail: ContextDetail::ActionableOnly,
            ..default_opts()
        };
        let prompt = build_user_prompt("test", &context, &history, &opts);
        assert!(!prompt.contains("text1"));
        assert!(prompt.contains("btn1"));
    }

    #[test]
    fn test_format_state_normal() {
        let state = ElementState {
            focused: false,
            enabled: true,
            visible: true,
            selected: false,
            expanded: None,
            checked: None,
        };
        assert_eq!(format_state(&state), "normal");
    }

    #[test]
    fn test_format_state_disabled() {
        let state = ElementState {
            focused: false,
            enabled: false,
            visible: true,
            selected: false,
            expanded: None,
            checked: None,
        };
        assert_eq!(format_state(&state), "disabled");
    }

    #[test]
    fn test_format_state_multiple_flags() {
        let state = ElementState {
            focused: true,
            enabled: false,
            visible: true,
            selected: true,
            expanded: None,
            checked: Some(true),
        };
        assert_eq!(format_state(&state), "focused,disabled,selected,checked");
    }

    #[test]
    fn test_summarize_action_variants() {
        assert_eq!(
            summarize_action(&PlannedAction::Click { target_id: "btn".into() }),
            "click(btn)"
        );
        assert_eq!(
            summarize_action(&PlannedAction::Key { key: "Enter".into() }),
            "key(Enter)"
        );
        assert_eq!(
            summarize_action(&PlannedAction::Done {
                summary: "All done".into(),
                evidence_ids: vec![],
            }),
            "DONE: All done"
        );
    }
}
