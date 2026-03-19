/// Core types for the CEL planner.

use serde::{Deserialize, Serialize};

/// How much detail to include in the context prompt.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum ContextDetail {
    /// Full 6-column table: ID, Type, Label, Value, State, Actions.
    #[default]
    Full,
    /// Compact 3-column table: ID, Type, Label. ~40% fewer tokens.
    Compact,
    /// Only elements that are enabled, visible, and have actions. ~60-80% fewer.
    ActionableOnly,
}

/// Configuration for a planning session.
#[derive(Debug, Clone)]
pub struct GoalConfig {
    /// The natural-language goal to achieve.
    pub goal: String,
    /// Maximum number of steps before the planner gives up.
    pub max_steps: u32,
    /// Maximum LLM retries per step on parse failure.
    pub max_retries: u32,
    /// LLM max_tokens for each planning call.
    pub max_tokens: u32,
    /// How much detail to include in the element table.
    pub context_detail: ContextDetail,
}

impl Default for GoalConfig {
    fn default() -> Self {
        Self {
            goal: String::new(),
            max_steps: 50,
            max_retries: 3,
            max_tokens: 2048,
            context_detail: ContextDetail::Full,
        }
    }
}

impl GoalConfig {
    pub fn new(goal: impl Into<String>) -> Self {
        Self {
            goal: goal.into(),
            ..Default::default()
        }
    }
}

/// A single planned step from the LLM.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlannedStep {
    /// Why the LLM chose this step (for transparency/debugging).
    pub reasoning: String,
    /// The action to take.
    pub action: PlannedAction,
    /// What should change after this step.
    pub expected_outcome: String,
    /// LLM's self-assessed confidence (0.0-1.0).
    pub confidence: f64,
}

/// A multi-step plan from the LLM (plan-ahead mode).
/// Only the first step is executed immediately; remaining steps are tentative
/// and will be re-evaluated if the context diverges from expectations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlannedPlan {
    /// High-level reasoning for the overall plan.
    pub overall_reasoning: String,
    /// Ordered list of planned steps. First step is executed, rest are tentative.
    pub steps: Vec<PlannedStep>,
}

/// The action the planner wants to execute.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PlannedAction {
    Click {
        target_id: String,
    },
    Type {
        target_id: String,
        text: String,
    },
    Key {
        key: String,
    },
    KeyCombo {
        keys: Vec<String>,
    },
    Scroll {
        dx: i32,
        dy: i32,
    },
    Wait {
        ms: u32,
    },
    Custom {
        adapter: String,
        action: String,
        #[serde(default)]
        params: serde_json::Value,
    },
    /// Terminal: goal achieved. `evidence_ids` should cite element IDs
    /// from the current context that prove the goal was achieved.
    Done {
        summary: String,
        #[serde(default)]
        evidence_ids: Vec<String>,
    },
    /// Terminal: cannot proceed.
    Fail {
        reason: String,
    },
}

/// Events emitted during the planning loop for observability.
#[derive(Debug, Clone)]
pub enum PlannerEvent {
    /// A step was planned.
    StepPlanned {
        step_index: u32,
        step: PlannedStep,
    },
    /// A step was executed (caller reports success/failure).
    StepExecuted {
        step_index: u32,
        success: bool,
        error: Option<String>,
    },
    /// The goal was achieved.
    GoalAchieved {
        summary: String,
        total_steps: u32,
    },
    /// The planner failed to achieve the goal.
    GoalFailed {
        reason: String,
        total_steps: u32,
    },
    /// LLM returned unparseable output (will retry).
    ParseRetry {
        step_index: u32,
        attempt: u32,
        raw_output: String,
    },
    /// Context had too few actionable elements, retrying.
    EmptyContextRetry {
        step_index: u32,
        actionable_count: usize,
        retry_attempt: u32,
    },
    /// Grounding validation failed (element ID not in context or blocking error).
    GroundingRejected {
        step_index: u32,
        reason: String,
    },
    /// Loop detected in agent behaviour.
    LoopDetected {
        step_index: u32,
        signal: String,
    },
}

/// Result of a single step in the history.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepRecord {
    pub step_index: u32,
    pub action: PlannedAction,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_planned_action_click_roundtrip() {
        let action = PlannedAction::Click {
            target_id: "dom:submit".into(),
        };
        let json = serde_json::to_string(&action).unwrap();
        let parsed: PlannedAction = serde_json::from_str(&json).unwrap();
        match parsed {
            PlannedAction::Click { target_id } => assert_eq!(target_id, "dom:submit"),
            _ => panic!("Wrong variant"),
        }
    }

    #[test]
    fn test_planned_action_type_roundtrip() {
        let action = PlannedAction::Type {
            target_id: "dom:email".into(),
            text: "admin@example.com".into(),
        };
        let json = serde_json::to_string(&action).unwrap();
        let parsed: PlannedAction = serde_json::from_str(&json).unwrap();
        match parsed {
            PlannedAction::Type { target_id, text } => {
                assert_eq!(target_id, "dom:email");
                assert_eq!(text, "admin@example.com");
            }
            _ => panic!("Wrong variant"),
        }
    }

    #[test]
    fn test_planned_action_done_roundtrip() {
        let action = PlannedAction::Done {
            summary: "Login successful".into(),
            evidence_ids: vec!["dom:welcome-banner".into()],
        };
        let json = serde_json::to_string(&action).unwrap();
        let parsed: PlannedAction = serde_json::from_str(&json).unwrap();
        match parsed {
            PlannedAction::Done { summary, evidence_ids } => {
                assert_eq!(summary, "Login successful");
                assert_eq!(evidence_ids, vec!["dom:welcome-banner"]);
            }
            _ => panic!("Wrong variant"),
        }
    }

    #[test]
    fn test_planned_action_done_without_evidence_deserializes() {
        // Backwards compatibility: old LLM responses without evidence_ids should still parse
        let json = r#"{"type":"done","summary":"All done"}"#;
        let parsed: PlannedAction = serde_json::from_str(json).unwrap();
        match parsed {
            PlannedAction::Done { summary, evidence_ids } => {
                assert_eq!(summary, "All done");
                assert!(evidence_ids.is_empty());
            }
            _ => panic!("Wrong variant"),
        }
    }

    #[test]
    fn test_planned_action_custom_roundtrip() {
        let action = PlannedAction::Custom {
            adapter: "browser".into(),
            action: "fill".into(),
            params: serde_json::json!({"selector": "#name", "value": "test"}),
        };
        let json = serde_json::to_string(&action).unwrap();
        let parsed: PlannedAction = serde_json::from_str(&json).unwrap();
        match parsed {
            PlannedAction::Custom {
                adapter, action, ..
            } => {
                assert_eq!(adapter, "browser");
                assert_eq!(action, "fill");
            }
            _ => panic!("Wrong variant"),
        }
    }

    #[test]
    fn test_planned_step_full_roundtrip() {
        let step = PlannedStep {
            reasoning: "The email field is visible and empty".into(),
            action: PlannedAction::Type {
                target_id: "dom:email".into(),
                text: "user@test.com".into(),
            },
            expected_outcome: "Email field filled".into(),
            confidence: 0.92,
        };
        let json = serde_json::to_string(&step).unwrap();
        let parsed: PlannedStep = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.reasoning, step.reasoning);
        assert_eq!(parsed.confidence, step.confidence);
        assert_eq!(parsed.expected_outcome, step.expected_outcome);
    }

    #[test]
    fn test_all_action_variants_serialize() {
        let actions = vec![
            PlannedAction::Click { target_id: "btn".into() },
            PlannedAction::Type { target_id: "inp".into(), text: "hi".into() },
            PlannedAction::Key { key: "Enter".into() },
            PlannedAction::KeyCombo { keys: vec!["Ctrl".into(), "S".into()] },
            PlannedAction::Scroll { dx: 0, dy: -3 },
            PlannedAction::Wait { ms: 1000 },
            PlannedAction::Custom {
                adapter: "browser".into(),
                action: "navigate".into(),
                params: serde_json::json!({"url": "https://example.com"}),
            },
            PlannedAction::Done { summary: "Done!".into(), evidence_ids: vec!["el1".into()] },
            PlannedAction::Fail { reason: "Not found".into() },
        ];

        for action in actions {
            let json = serde_json::to_string(&action).unwrap();
            let parsed: PlannedAction = serde_json::from_str(&json).unwrap();
            // Verify type field is present in JSON
            let obj: serde_json::Value = serde_json::from_str(&json).unwrap();
            assert!(obj.get("type").is_some(), "Missing 'type' field in: {}", json);
            // Verify roundtrip doesn't panic
            let _ = serde_json::to_string(&parsed).unwrap();
        }
    }
}
