/// Step history tracking for the planner's LLM prompt.

use crate::types::{PlannedAction, StepRecord};

/// Tracks executed steps so the LLM can see what happened.
#[derive(Debug, Default)]
pub struct StepHistory {
    steps: Vec<StepRecord>,
}

impl StepHistory {
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a history from existing records (used when resuming via NAPI).
    pub fn from_records(records: Vec<StepRecord>) -> Self {
        Self { steps: records }
    }

    /// Record a step result.
    pub fn record(
        &mut self,
        step_index: u32,
        action: PlannedAction,
        success: bool,
        error: Option<String>,
    ) {
        self.steps.push(StepRecord {
            step_index,
            action,
            success,
            error,
        });
    }

    /// Get the last N steps for the prompt (keeps prompt size bounded).
    pub fn recent(&self, n: usize) -> &[StepRecord] {
        let start = self.steps.len().saturating_sub(n);
        &self.steps[start..]
    }

    /// Total number of recorded steps.
    pub fn len(&self) -> usize {
        self.steps.len()
    }

    /// Whether no steps have been recorded.
    pub fn is_empty(&self) -> bool {
        self.steps.is_empty()
    }

    /// Get all recorded steps.
    pub fn all(&self) -> &[StepRecord] {
        &self.steps
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_history() {
        let history = StepHistory::new();
        assert!(history.is_empty());
        assert_eq!(history.len(), 0);
        assert_eq!(history.recent(5).len(), 0);
    }

    #[test]
    fn test_record_and_retrieve() {
        let mut history = StepHistory::new();
        history.record(
            0,
            PlannedAction::Click { target_id: "btn1".into() },
            true,
            None,
        );
        history.record(
            1,
            PlannedAction::Type { target_id: "inp".into(), text: "hello".into() },
            true,
            None,
        );
        assert_eq!(history.len(), 2);
        assert!(!history.is_empty());
    }

    #[test]
    fn test_recent_window() {
        let mut history = StepHistory::new();
        for i in 0..20 {
            history.record(
                i,
                PlannedAction::Click { target_id: format!("btn{}", i) },
                true,
                None,
            );
        }
        let recent = history.recent(5);
        assert_eq!(recent.len(), 5);
        assert_eq!(recent[0].step_index, 15);
        assert_eq!(recent[4].step_index, 19);
    }

    #[test]
    fn test_recent_fewer_than_n() {
        let mut history = StepHistory::new();
        history.record(
            0,
            PlannedAction::Click { target_id: "btn".into() },
            true,
            None,
        );
        let recent = history.recent(10);
        assert_eq!(recent.len(), 1);
    }

    #[test]
    fn test_from_records() {
        let records = vec![
            StepRecord {
                step_index: 0,
                action: PlannedAction::Click { target_id: "a".into() },
                success: true,
                error: None,
            },
            StepRecord {
                step_index: 1,
                action: PlannedAction::Fail { reason: "not found".into() },
                success: false,
                error: Some("Element missing".into()),
            },
        ];
        let history = StepHistory::from_records(records);
        assert_eq!(history.len(), 2);
        assert!(!history.all()[1].success);
    }
}
