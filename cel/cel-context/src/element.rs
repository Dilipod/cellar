use serde::{Deserialize, Serialize};

/// Re-export Bounds and ElementState from the accessibility crate — single source of truth.
pub use cel_accessibility::Bounds;
pub use cel_accessibility::ElementState;

/// The source that provided a context element.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ContextSource {
    /// From the accessibility tree (UIA / AXUIElement).
    AccessibilityTree,
    /// From a native API adapter (SAP, Excel COM, etc.).
    NativeApi,
    /// From vision model analysis.
    Vision,
    /// Merged from multiple sources.
    Merged,
}

/// A single UI element in the unified context model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextElement {
    /// Unique identifier for this element.
    pub id: String,
    /// Human-readable label.
    pub label: Option<String>,
    /// Accessibility description (tooltip / secondary label).
    pub description: Option<String>,
    /// Element type (button, input, text, etc.).
    pub element_type: String,
    /// Current value (for inputs, dropdowns, etc.).
    pub value: Option<String>,
    /// Screen-space bounding rectangle.
    pub bounds: Option<Bounds>,
    /// Current state flags (from accessibility tree).
    pub state: Option<ElementState>,
    /// ID of the parent element (None for root elements).
    pub parent_id: Option<String>,
    /// Available actions (from AT-SPI2 Action interface): "click", "press", "activate", etc.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub actions: Vec<String>,
    /// Confidence score (0.0 - 1.0).
    pub confidence: f64,
    /// Which context source provided this element.
    pub source: ContextSource,
}

/// The complete screen context — the unified world model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenContext {
    /// Name of the foreground application.
    pub app: String,
    /// Title of the active window.
    pub window: String,
    /// All detected UI elements, sorted by confidence (highest first).
    pub elements: Vec<ContextElement>,
    /// Recent network events (new connections detected since last snapshot).
    #[serde(default)]
    pub network_events: Vec<cel_network::NetworkEvent>,
    /// Timestamp of this context snapshot (ms since epoch).
    pub timestamp_ms: u64,
}
