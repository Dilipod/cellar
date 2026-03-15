use serde::{Deserialize, Serialize};

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

/// Bounding rectangle in screen coordinates.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// A single UI element in the unified context model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextElement {
    /// Unique identifier for this element.
    pub id: String,
    /// Human-readable label.
    pub label: Option<String>,
    /// Element type (button, input, text, etc.).
    pub element_type: String,
    /// Current value (for inputs, dropdowns, etc.).
    pub value: Option<String>,
    /// Screen-space bounding rectangle.
    pub bounds: Option<Bounds>,
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
    /// Timestamp of this context snapshot (ms since epoch).
    pub timestamp_ms: u64,
}
