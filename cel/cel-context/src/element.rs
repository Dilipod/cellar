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
    /// Defaults to all-false for sources that don't provide state (e.g., vision).
    #[serde(default)]
    pub state: ElementState,
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

/// Coarse spatial region for resilient element targeting.
/// Uses normalized coordinates (0.0-1.0) so references survive resolution changes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoundsRegion {
    /// Spatial quadrant: "top-left", "top-center", "top-right",
    /// "center-left", "center", "center-right",
    /// "bottom-left", "bottom-center", "bottom-right"
    pub quadrant: String,
    /// Normalized horizontal position (0.0 = left edge, 1.0 = right edge).
    pub relative_x: f64,
    /// Normalized vertical position (0.0 = top edge, 1.0 = bottom edge).
    pub relative_y: f64,
}

/// A resilient, multi-signal reference to a UI element.
/// Unlike element IDs (which are ephemeral per snapshot), references survive
/// across context snapshots by combining multiple identifying signals.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextReference {
    /// Element type (button, input, text, etc.) — must match exactly.
    pub element_type: String,
    /// Expected label text (fuzzy matched).
    pub label: Option<String>,
    /// Ancestor path from root: e.g. \["window:Finder", "toolbar", "group"\].
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ancestor_path: Vec<String>,
    /// Coarse spatial region where the element was last seen.
    pub bounds_region: Option<BoundsRegion>,
    /// Pattern the element's value should match.
    pub value_pattern: Option<String>,
}

impl ContextElement {
    /// Build a resilient reference from this element's current data.
    /// `screen_width` and `screen_height` are used to compute normalized coordinates.
    pub fn to_reference(&self, screen_width: u32, screen_height: u32) -> ContextReference {
        let bounds_region = self.bounds.as_ref().and_then(|b| {
            if screen_width == 0 || screen_height == 0 {
                return None;
            }
            let cx = b.x as f64 + b.width as f64 / 2.0;
            let cy = b.y as f64 + b.height as f64 / 2.0;
            let rx = cx / screen_width as f64;
            let ry = cy / screen_height as f64;

            let col = if rx < 0.33 {
                "left"
            } else if rx < 0.66 {
                "center"
            } else {
                "right"
            };
            let row = if ry < 0.33 {
                "top"
            } else if ry < 0.66 {
                "center"
            } else {
                "bottom"
            };
            let quadrant = if row == "center" && col == "center" {
                "center".to_string()
            } else {
                format!("{}-{}", row, col)
            };

            Some(BoundsRegion {
                quadrant,
                relative_x: rx.clamp(0.0, 1.0),
                relative_y: ry.clamp(0.0, 1.0),
            })
        });

        ContextReference {
            element_type: self.element_type.clone(),
            label: self.label.clone(),
            ancestor_path: Vec::new(), // TODO: build from parent_id chain
            bounds_region,
            value_pattern: self.value.clone(),
        }
    }
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

/// High-fidelity context for a single element — the "zoom in" view.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FocusedContext {
    /// The target element with full detail.
    pub element: ContextElement,
    /// Children (preserves hierarchy, not flattened).
    pub subtree: Vec<ContextElement>,
    /// Parent chain from root to this element: e.g. ["window:Title", "group", "toolbar"].
    pub ancestor_path: Vec<String>,
}
