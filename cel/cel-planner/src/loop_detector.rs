/// Loop detection for the planner.
///
/// Detects when the agent is stuck: repeating the same action,
/// ping-ponging between two actions, or acting on an unchanging context.
/// Inspired by browser-use's loop detection (added Jan 2026).

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use cel_context::ScreenContext;

use crate::types::PlannedAction;

/// Window of recent entries to consider for loop detection.
const WINDOW_SIZE: usize = 8;
/// How many consecutive repeats trigger a warning.
const REPEAT_THRESHOLD: usize = 3;
/// How many unchanged context snapshots trigger a stale warning.
const STALE_THRESHOLD: usize = 3;

/// Signal from the loop detector.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LoopSignal {
    /// No loop detected.
    None,
    /// Same action repeated N times consecutively.
    Repeat {
        action_summary: String,
        count: usize,
    },
    /// Alternating between two actions (A-B-A-B).
    PingPong {
        action_a: String,
        action_b: String,
    },
    /// Context fingerprint hasn't changed for N steps despite actions.
    StaleContext {
        steps_unchanged: usize,
    },
}

impl std::fmt::Display for LoopSignal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LoopSignal::None => write!(f, "none"),
            LoopSignal::Repeat { action_summary, count } => {
                write!(f, "Repeated '{}' {} times", action_summary, count)
            }
            LoopSignal::PingPong { action_a, action_b } => {
                write!(f, "Ping-ponging between '{}' and '{}'", action_a, action_b)
            }
            LoopSignal::StaleContext { steps_unchanged } => {
                write!(f, "Context unchanged for {} steps", steps_unchanged)
            }
        }
    }
}

/// Tracks recent actions and context fingerprints to detect loops.
pub struct LoopDetector {
    action_hashes: Vec<u64>,
    action_summaries: Vec<String>,
    context_hashes: Vec<u64>,
    /// How many additional steps to allow after a warning before auto-failing.
    grace_steps_remaining: Option<u32>,
}

impl LoopDetector {
    pub fn new() -> Self {
        Self {
            action_hashes: Vec::with_capacity(WINDOW_SIZE),
            action_summaries: Vec::with_capacity(WINDOW_SIZE),
            context_hashes: Vec::with_capacity(WINDOW_SIZE),
            grace_steps_remaining: None,
        }
    }

    /// Check for loops after recording an action and its resulting context.
    /// Returns the strongest signal detected.
    pub fn check(&mut self, action: &PlannedAction, context_hash: u64) -> LoopSignal {
        let action_hash = hash_action(action);
        let action_summary = summarize_action(action);

        self.action_hashes.push(action_hash);
        self.action_summaries.push(action_summary);
        self.context_hashes.push(context_hash);

        // Keep windows bounded
        if self.action_hashes.len() > WINDOW_SIZE {
            self.action_hashes.remove(0);
            self.action_summaries.remove(0);
        }
        if self.context_hashes.len() > WINDOW_SIZE {
            self.context_hashes.remove(0);
        }

        // Track grace period
        if let Some(ref mut remaining) = self.grace_steps_remaining {
            if *remaining == 0 {
                // Grace expired — caller should auto-fail
                return self.detect_any();
            }
            *remaining = remaining.saturating_sub(1);
        }

        self.detect_any()
    }

    /// Whether the grace period after a warning has expired (caller should auto-fail).
    pub fn should_auto_fail(&self) -> bool {
        self.grace_steps_remaining == Some(0)
    }

    /// Start a grace period of N steps after issuing a warning.
    pub fn start_grace(&mut self, steps: u32) {
        self.grace_steps_remaining = Some(steps);
    }

    /// Reset the detector (e.g., when context changes significantly).
    pub fn reset(&mut self) {
        self.action_hashes.clear();
        self.action_summaries.clear();
        self.context_hashes.clear();
        self.grace_steps_remaining = None;
    }

    fn detect_any(&self) -> LoopSignal {
        // Check for repeats first (strongest signal)
        if let Some(signal) = self.detect_repeat() {
            return signal;
        }
        if let Some(signal) = self.detect_ping_pong() {
            return signal;
        }
        if let Some(signal) = self.detect_stale_context() {
            return signal;
        }
        LoopSignal::None
    }

    fn detect_repeat(&self) -> Option<LoopSignal> {
        if self.action_hashes.len() < REPEAT_THRESHOLD {
            return None;
        }
        let last = self.action_hashes.last()?;
        let tail = &self.action_hashes[self.action_hashes.len().saturating_sub(REPEAT_THRESHOLD)..];
        if tail.iter().all(|h| h == last) {
            Some(LoopSignal::Repeat {
                action_summary: self.action_summaries.last().cloned().unwrap_or_default(),
                count: tail.len(),
            })
        } else {
            None
        }
    }

    fn detect_ping_pong(&self) -> Option<LoopSignal> {
        if self.action_hashes.len() < 4 {
            return None;
        }
        let n = self.action_hashes.len();
        let a = self.action_hashes[n - 4];
        let b = self.action_hashes[n - 3];
        if a != b
            && self.action_hashes[n - 2] == a
            && self.action_hashes[n - 1] == b
        {
            Some(LoopSignal::PingPong {
                action_a: self.action_summaries[n - 4].clone(),
                action_b: self.action_summaries[n - 3].clone(),
            })
        } else {
            None
        }
    }

    fn detect_stale_context(&self) -> Option<LoopSignal> {
        if self.context_hashes.len() < STALE_THRESHOLD {
            return None;
        }
        let last = self.context_hashes.last()?;
        let tail =
            &self.context_hashes[self.context_hashes.len().saturating_sub(STALE_THRESHOLD)..];
        if tail.iter().all(|h| h == last) {
            Some(LoopSignal::StaleContext {
                steps_unchanged: tail.len(),
            })
        } else {
            None
        }
    }
}

/// Compute a fingerprint for a ScreenContext (hash of element IDs + app + window).
pub fn context_fingerprint(ctx: &ScreenContext) -> u64 {
    let mut hasher = DefaultHasher::new();
    ctx.app.hash(&mut hasher);
    ctx.window.hash(&mut hasher);
    for el in &ctx.elements {
        el.id.hash(&mut hasher);
    }
    hasher.finish()
}

fn hash_action(action: &PlannedAction) -> u64 {
    let mut hasher = DefaultHasher::new();
    match action {
        PlannedAction::Click { target_id } => {
            "click".hash(&mut hasher);
            target_id.hash(&mut hasher);
        }
        PlannedAction::Type { target_id, text } => {
            "type".hash(&mut hasher);
            target_id.hash(&mut hasher);
            text.hash(&mut hasher);
        }
        PlannedAction::Key { key } => {
            "key".hash(&mut hasher);
            key.hash(&mut hasher);
        }
        PlannedAction::KeyCombo { keys } => {
            "key_combo".hash(&mut hasher);
            keys.hash(&mut hasher);
        }
        PlannedAction::Scroll { dx, dy } => {
            "scroll".hash(&mut hasher);
            dx.hash(&mut hasher);
            dy.hash(&mut hasher);
        }
        PlannedAction::Wait { ms } => {
            "wait".hash(&mut hasher);
            ms.hash(&mut hasher);
        }
        PlannedAction::Custom { adapter, action, .. } => {
            "custom".hash(&mut hasher);
            adapter.hash(&mut hasher);
            action.hash(&mut hasher);
        }
        PlannedAction::Done { summary, .. } => {
            "done".hash(&mut hasher);
            summary.hash(&mut hasher);
        }
        PlannedAction::Fail { reason } => {
            "fail".hash(&mut hasher);
            reason.hash(&mut hasher);
        }
    }
    hasher.finish()
}

fn summarize_action(action: &PlannedAction) -> String {
    match action {
        PlannedAction::Click { target_id } => format!("click({})", target_id),
        PlannedAction::Type { target_id, text } => {
            let t = if text.len() > 15 { &text[..15] } else { text };
            format!("type({}, \"{}\")", target_id, t)
        }
        PlannedAction::Key { key } => format!("key({})", key),
        PlannedAction::KeyCombo { keys } => format!("combo({})", keys.join("+")),
        PlannedAction::Scroll { dx, dy } => format!("scroll({},{})", dx, dy),
        PlannedAction::Wait { ms } => format!("wait({}ms)", ms),
        PlannedAction::Custom { adapter, action, .. } => format!("custom({}.{})", adapter, action),
        PlannedAction::Done { summary, .. } => format!("done({})", summary),
        PlannedAction::Fail { reason } => format!("fail({})", reason),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn click(id: &str) -> PlannedAction {
        PlannedAction::Click {
            target_id: id.into(),
        }
    }

    #[test]
    fn test_no_loop_on_varied_actions() {
        let mut det = LoopDetector::new();
        assert_eq!(det.check(&click("a"), 1), LoopSignal::None);
        assert_eq!(det.check(&click("b"), 2), LoopSignal::None);
        assert_eq!(det.check(&click("c"), 3), LoopSignal::None);
    }

    #[test]
    fn test_repeat_detection() {
        let mut det = LoopDetector::new();
        det.check(&click("btn"), 1);
        det.check(&click("btn"), 2);
        let signal = det.check(&click("btn"), 3);
        match signal {
            LoopSignal::Repeat { count, .. } => assert_eq!(count, 3),
            other => panic!("Expected Repeat, got {:?}", other),
        }
    }

    #[test]
    fn test_ping_pong_detection() {
        let mut det = LoopDetector::new();
        det.check(&click("a"), 1);
        det.check(&click("b"), 2);
        det.check(&click("a"), 3);
        let signal = det.check(&click("b"), 4);
        match signal {
            LoopSignal::PingPong { .. } => {}
            other => panic!("Expected PingPong, got {:?}", other),
        }
    }

    #[test]
    fn test_stale_context_detection() {
        let mut det = LoopDetector::new();
        // Different actions but same context hash
        det.check(&click("a"), 42);
        det.check(&click("b"), 42);
        let signal = det.check(&click("c"), 42);
        match signal {
            LoopSignal::StaleContext { steps_unchanged } => assert_eq!(steps_unchanged, 3),
            other => panic!("Expected StaleContext, got {:?}", other),
        }
    }

    #[test]
    fn test_grace_period() {
        let mut det = LoopDetector::new();
        det.check(&click("btn"), 1);
        det.check(&click("btn"), 2);
        det.check(&click("btn"), 3); // Repeat detected

        det.start_grace(2);
        assert!(!det.should_auto_fail());

        det.check(&click("btn"), 4); // Grace 2 → 1
        assert!(!det.should_auto_fail());

        det.check(&click("btn"), 5); // Grace 1 → 0
        assert!(det.should_auto_fail());
    }

    #[test]
    fn test_reset_clears_state() {
        let mut det = LoopDetector::new();
        det.check(&click("a"), 1);
        det.check(&click("a"), 1);
        det.check(&click("a"), 1);
        det.reset();
        assert_eq!(det.check(&click("a"), 2), LoopSignal::None);
    }
}
