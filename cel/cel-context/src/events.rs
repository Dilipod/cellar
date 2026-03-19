//! CEL event types for the watchdog system.

use serde::{Deserialize, Serialize};

/// Events emitted by the ContextWatchdog when screen state changes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum CelEvent {
    /// Accessibility tree changed (elements added or removed).
    TreeChanged {
        added: Vec<String>,
        removed: Vec<String>,
    },
    /// Network became idle (no new connections recently).
    NetworkIdle,
    /// Keyboard/mouse focus moved to a different element.
    FocusChanged {
        old: Option<String>,
        new: Option<String>,
    },
}
