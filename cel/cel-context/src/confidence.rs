use serde::{Deserialize, Serialize};

/// Confidence thresholds for agent behavior.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfidenceThresholds {
    /// Above this: act immediately (default 0.9).
    pub act_immediately: f64,
    /// Above this: act and log for review (default 0.7).
    pub act_and_log: f64,
    /// Above this: act cautiously, verify result (default 0.5).
    /// Below this threshold: pause and notify user.
    pub act_cautiously: f64,
}

impl Default for ConfidenceThresholds {
    fn default() -> Self {
        Self {
            act_immediately: 0.9,
            act_and_log: 0.7,
            act_cautiously: 0.5,
        }
    }
}

/// What behavior the agent should exhibit given a confidence score.
#[derive(Debug, Clone, PartialEq)]
pub enum ConfidenceBehavior {
    /// 0.9-1.0: Act immediately, no hesitation.
    ActImmediately,
    /// 0.7-0.9: Act and log for review.
    ActAndLog,
    /// 0.5-0.7: Act cautiously, verify result.
    ActCautiously,
    /// Below 0.5: Pause, notify user, wait for instruction.
    PauseAndNotify,
}

impl ConfidenceThresholds {
    /// Determine behavior for a given confidence score.
    pub fn behavior_for(&self, confidence: f64) -> ConfidenceBehavior {
        if confidence >= self.act_immediately {
            ConfidenceBehavior::ActImmediately
        } else if confidence >= self.act_and_log {
            ConfidenceBehavior::ActAndLog
        } else if confidence >= self.act_cautiously {
            ConfidenceBehavior::ActCautiously
        } else {
            ConfidenceBehavior::PauseAndNotify
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_confidence_thresholds() {
        let thresholds = ConfidenceThresholds::default();

        assert_eq!(thresholds.behavior_for(0.95), ConfidenceBehavior::ActImmediately);
        assert_eq!(thresholds.behavior_for(0.9), ConfidenceBehavior::ActImmediately);
        assert_eq!(thresholds.behavior_for(0.85), ConfidenceBehavior::ActAndLog);
        assert_eq!(thresholds.behavior_for(0.7), ConfidenceBehavior::ActAndLog);
        assert_eq!(thresholds.behavior_for(0.6), ConfidenceBehavior::ActCautiously);
        assert_eq!(thresholds.behavior_for(0.5), ConfidenceBehavior::ActCautiously);
        assert_eq!(thresholds.behavior_for(0.3), ConfidenceBehavior::PauseAndNotify);
        assert_eq!(thresholds.behavior_for(0.0), ConfidenceBehavior::PauseAndNotify);
    }
}
