/// Step history tracking for the planner's LLM prompt.
///
/// Includes message compaction: when history exceeds a threshold,
/// older steps are summarized into a compact digest instead of being
/// dropped entirely. This prevents context overflow while preserving
/// key information (browser-use learned this matters Feb 2026).

use crate::types::{PlannedAction, StepRecord};

/// When total steps exceed this, compact older ones into a summary.
const COMPACTION_THRESHOLD: usize = 20;

/// Tracks executed steps so the LLM can see what happened.
#[derive(Debug, Default)]
pub struct StepHistory {
    steps: Vec<StepRecord>,
    /// Compact summary of steps that were compacted away.
    compacted_summary: Option<String>,
}

impl StepHistory {
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a history from existing records (used when resuming via NAPI).
    pub fn from_records(records: Vec<StepRecord>) -> Self {
        Self {
            steps: records,
            compacted_summary: None,
        }
    }

    /// Record a step result. Triggers compaction if threshold is exceeded.
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

        // Compact when we exceed the threshold
        if self.steps.len() > COMPACTION_THRESHOLD {
            self.compact();
        }
    }

    /// Get the last N steps for the prompt (keeps prompt size bounded).
    pub fn recent(&self, n: usize) -> &[StepRecord] {
        let start = self.steps.len().saturating_sub(n);
        &self.steps[start..]
    }

    /// Get the compacted summary of older steps, if any.
    pub fn compacted_summary(&self) -> Option<&str> {
        self.compacted_summary.as_deref()
    }

    /// Total number of recorded steps (including compacted).
    pub fn len(&self) -> usize {
        self.steps.len()
    }

    /// Whether no steps have been recorded.
    pub fn is_empty(&self) -> bool {
        self.steps.is_empty()
    }

    /// Get all recorded steps (not including compacted summary).
    pub fn all(&self) -> &[StepRecord] {
        &self.steps
    }

    /// Compact older steps into a summary, keeping only recent steps.
    /// Preserves the last `COMPACTION_THRESHOLD / 2` steps and summarizes the rest.
    fn compact(&mut self) {
        let keep = COMPACTION_THRESHOLD / 2;
        if self.steps.len() <= keep {
            return;
        }

        let to_compact = self.steps.len() - keep;
        let compacting = &self.steps[..to_compact];

        // Build summary of compacted steps
        let succeeded = compacting.iter().filter(|s| s.success).count();
        let failed = compacting.iter().filter(|s| !s.success).count();
        let first_index = compacting.first().map(|s| s.step_index).unwrap_or(0);
        let last_index = compacting.last().map(|s| s.step_index).unwrap_or(0);

        // Collect unique failure reasons
        let failure_reasons: Vec<_> = compacting
            .iter()
            .filter(|s| !s.success)
            .filter_map(|s| s.error.as_deref())
            .take(3) // Keep only first 3 unique failure reasons
            .collect();

        let mut summary = format!(
            "Steps {}-{}: {} succeeded, {} failed.",
            first_index + 1,
            last_index + 1,
            succeeded,
            failed,
        );

        if !failure_reasons.is_empty() {
            summary.push_str(" Failures: ");
            summary.push_str(&failure_reasons.join("; "));
            summary.push('.');
        }

        // Prepend to any existing compacted summary
        if let Some(existing) = &self.compacted_summary {
            self.compacted_summary = Some(format!("{} {}", existing, summary));
        } else {
            self.compacted_summary = Some(summary);
        }

        // Keep only the recent steps
        self.steps = self.steps.split_off(to_compact);
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
        assert!(history.compacted_summary().is_none());
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

    #[test]
    fn test_compaction_triggers_at_threshold() {
        let mut history = StepHistory::new();
        // Record 21 steps — exceeds COMPACTION_THRESHOLD (20)
        for i in 0..21 {
            history.record(
                i,
                PlannedAction::Click { target_id: format!("btn{}", i) },
                i % 3 != 0, // Every 3rd step fails
                if i % 3 == 0 { Some(format!("Error at step {}", i)) } else { None },
            );
        }

        // Should have been compacted — only 10 recent steps remain
        assert_eq!(history.len(), 10);
        assert!(history.compacted_summary().is_some());

        let summary = history.compacted_summary().unwrap();
        assert!(summary.contains("succeeded"));
        assert!(summary.contains("failed"));
    }

    #[test]
    fn test_compaction_preserves_recent_steps() {
        let mut history = StepHistory::new();
        for i in 0..25 {
            history.record(
                i,
                PlannedAction::Click { target_id: format!("btn{}", i) },
                true,
                None,
            );
        }

        // Recent steps should be the latest ones
        let recent = history.recent(5);
        assert_eq!(recent.last().unwrap().step_index, 24);
    }

    #[test]
    fn test_compaction_records_failures() {
        let mut history = StepHistory::new();
        for i in 0..21 {
            history.record(
                i,
                PlannedAction::Click { target_id: "btn".into() },
                false,
                Some(format!("Failed: {}", i)),
            );
        }

        let summary = history.compacted_summary().unwrap();
        assert!(summary.contains("failed"));
        assert!(summary.contains("Failed:"));
    }
}
