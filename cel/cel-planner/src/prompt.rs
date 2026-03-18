/// LLM prompt construction for the CEL planner.
///
/// Serializes ScreenContext elements into a compact table format
/// that the LLM can reason about, along with step history and goal.

use cel_context::ScreenContext;

use crate::history::StepHistory;
use crate::types::PlannedAction;

/// Maximum elements to include in the prompt (already sorted by confidence).
const MAX_ELEMENTS: usize = 40;

/// Maximum recent steps to include in history.
const MAX_HISTORY_STEPS: usize = 10;

/// The system prompt that defines the LLM's role and output schema.
pub fn system_prompt() -> String {
    r#"You are a UI automation agent. You interact with desktop and web applications by observing UI elements and deciding what action to take next.

## Rules
1. You are given a GOAL and the current SCREEN CONTEXT (visible UI elements).
2. Return exactly ONE action as a JSON object with the schema below.
3. Pick the element most likely to advance the goal. Use the element ID from the context.
4. If the goal is achieved, return a "done" action.
5. If the goal cannot be achieved (missing elements, error state), return a "fail" action.
6. Never invent element IDs. Only use IDs from the context.
7. If a previous step failed, try a different approach.

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
- {"type": "done", "summary": "Goal achieved: ..."} — Goal complete
- {"type": "fail", "reason": "Cannot proceed because ..."} — Goal impossible

Respond ONLY with valid JSON. No explanation outside the JSON."#
        .to_string()
}

/// Build the user prompt with current context and step history.
pub fn build_user_prompt(
    goal: &str,
    context: &ScreenContext,
    history: &StepHistory,
) -> String {
    let mut prompt = String::with_capacity(4096);

    // Goal
    prompt.push_str(&format!("## Goal\n{}\n\n", goal));

    // Current screen
    prompt.push_str(&format!(
        "## Current Screen\nApp: {} | Window: {}\n\n",
        context.app, context.window
    ));

    // Elements table
    prompt.push_str("## UI Elements\n");
    prompt.push_str("| ID | Type | Label | Value | State | Actions |\n");
    prompt.push_str("|-----|------|-------|-------|-------|--------|\n");

    for el in context.elements.iter().take(MAX_ELEMENTS) {
        let label = el.label.as_deref().unwrap_or("-");
        let value = el.value.as_deref().unwrap_or("-");
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

    if context.elements.len() > MAX_ELEMENTS {
        prompt.push_str(&format!(
            "\n({} more elements not shown)\n",
            context.elements.len() - MAX_ELEMENTS
        ));
    }
    prompt.push('\n');

    // Network events (if any)
    if !context.network_events.is_empty() {
        prompt.push_str("## Recent Network\n");
        for event in context.network_events.iter().take(5) {
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

    // Step history
    let recent = history.recent(MAX_HISTORY_STEPS);
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
        PlannedAction::Done { summary } => format!("DONE: {}", truncate(summary, 40)),
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

    #[test]
    fn test_system_prompt_contains_schema() {
        let prompt = system_prompt();
        assert!(prompt.contains("reasoning"));
        assert!(prompt.contains("action"));
        assert!(prompt.contains("expected_outcome"));
        assert!(prompt.contains("confidence"));
        assert!(prompt.contains("done"));
        assert!(prompt.contains("fail"));
    }

    #[test]
    fn test_user_prompt_contains_goal() {
        let context = make_context(vec![]);
        let history = StepHistory::new();
        let prompt = build_user_prompt("Log in to admin", &context, &history);
        assert!(prompt.contains("Log in to admin"));
    }

    #[test]
    fn test_user_prompt_contains_app_info() {
        let context = make_context(vec![]);
        let history = StepHistory::new();
        let prompt = build_user_prompt("test", &context, &history);
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
        let prompt = build_user_prompt("test", &context, &history);
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
        let prompt = build_user_prompt("test", &context, &history);
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
        let prompt = build_user_prompt("test", &context, &history);
        // Should contain the overflow notice
        assert!(prompt.contains("20 more elements not shown"));
        // Should contain early elements but not late ones
        assert!(prompt.contains("el0"));
        assert!(prompt.contains("el39"));
        assert!(!prompt.contains("| el40 |"));
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
            summarize_action(&PlannedAction::Done { summary: "All done".into() }),
            "DONE: All done"
        );
    }
}
