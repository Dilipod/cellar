use crate::element::{Bounds, ContextElement, ContextSource, ScreenContext};
use cel_accessibility::{AccessibilityElement, AccessibilityTree, ElementRole};
use cel_display::ScreenCapture;
use cel_network::{NetworkEvent, NetworkMonitor};
use cel_vision::VisionProvider;

/// Minimum number of actionable elements (buttons, inputs, links, etc.)
/// below which the vision fallback is triggered.
const VISION_FALLBACK_THRESHOLD: usize = 3;

/// Merges context from all available streams into a unified ScreenContext.
pub struct ContextMerger {
    accessibility: Box<dyn AccessibilityTree>,
    display: Option<Box<dyn ScreenCapture>>,
    network: Option<Box<dyn NetworkMonitor>>,
    vision: Option<Box<dyn VisionProvider>>,
    /// Recent network events, carried across calls for context.
    recent_network: Vec<NetworkEvent>,
    /// Tokio runtime handle for running async vision calls from sync context.
    runtime: Option<tokio::runtime::Handle>,
}

impl ContextMerger {
    pub fn new(accessibility: Box<dyn AccessibilityTree>) -> Self {
        Self {
            accessibility,
            display: None,
            network: None,
            vision: None,
            recent_network: Vec::new(),
            runtime: tokio::runtime::Handle::try_current().ok(),
        }
    }

    /// Create a merger with display layer for foreground app detection.
    pub fn with_display(
        accessibility: Box<dyn AccessibilityTree>,
        display: Box<dyn ScreenCapture>,
    ) -> Self {
        Self {
            accessibility,
            display: Some(display),
            network: None,
            vision: None,
            recent_network: Vec::new(),
            runtime: tokio::runtime::Handle::try_current().ok(),
        }
    }

    /// Create a merger with all available streams.
    pub fn with_all(
        accessibility: Box<dyn AccessibilityTree>,
        display: Box<dyn ScreenCapture>,
        network: Box<dyn NetworkMonitor>,
    ) -> Self {
        Self {
            accessibility,
            display: Some(display),
            network: Some(network),
            vision: None,
            recent_network: Vec::new(),
            runtime: tokio::runtime::Handle::try_current().ok(),
        }
    }

    /// Attach a vision provider for automatic fallback when accessibility is insufficient.
    pub fn with_vision(mut self, vision: Box<dyn VisionProvider>) -> Self {
        self.vision = Some(vision);
        self
    }

    /// Set the tokio runtime handle for async vision calls.
    pub fn with_runtime(mut self, handle: tokio::runtime::Handle) -> Self {
        self.runtime = Some(handle);
        self
    }

    /// Build a unified context by querying all available streams.
    ///
    /// Priority order:
    /// 1. Native API (highest confidence, when adapter available)
    /// 2. Accessibility tree (structured, reliable on modern apps)
    /// 3. Vision (automatic fallback when a11y yields few actionable elements)
    /// 4. Network (supplementary — connection state signals)
    pub fn get_context(&mut self) -> ScreenContext {
        let mut elements = Vec::new();

        // Query accessibility tree
        match self.accessibility.get_tree() {
            Ok(tree) => {
                self.flatten_a11y_tree(&tree, &mut elements);
            }
            Err(e) => {
                tracing::warn!("Accessibility tree unavailable: {}", e);
            }
        }

        // Vision fallback: if too few actionable elements, capture screen and run vision
        let actionable_count = elements
            .iter()
            .filter(|e| is_actionable_type(&e.element_type))
            .count();

        if actionable_count < VISION_FALLBACK_THRESHOLD {
            if let Some(vision_elements) = self.run_vision_fallback() {
                for ve in vision_elements {
                    let dominated = elements.iter().any(|e| {
                        if let (Some(eb), Some(vb)) = (&e.bounds, &ve.bounds) {
                            bounds_overlap(eb, vb) > 0.5
                        } else {
                            false
                        }
                    });
                    if !dominated {
                        elements.push(ve);
                    }
                }
            }
        }

        // Drain network events (supplementary context)
        if let Some(ref mut net) = self.network {
            let events = net.drain_events();
            self.recent_network.extend(events);
            // Keep only last 50 events
            if self.recent_network.len() > 50 {
                let drain_count = self.recent_network.len() - 50;
                self.recent_network.drain(..drain_count);
            }
        }

        // Sort by confidence (highest first)
        elements.sort_by(|a, b| {
            b.confidence
                .partial_cmp(&a.confidence)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // Detect foreground app/window from display layer
        let (app, window) = self.detect_foreground();

        ScreenContext {
            app,
            window,
            elements,
            network_events: self.recent_network.clone(),
            timestamp_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        }
    }

    /// Get recent network events (for supplementary context).
    pub fn recent_network_events(&self) -> &[NetworkEvent] {
        &self.recent_network
    }

    /// Run vision analysis on the current screen, returning ContextElements.
    /// Returns None if vision is not configured or capture/analysis fails.
    fn run_vision_fallback(&mut self) -> Option<Vec<ContextElement>> {
        let vision = self.vision.as_ref()?;
        let display = self.display.as_mut()?;
        let runtime = self.runtime.as_ref()?;

        let frame = match display.capture_frame() {
            Ok(f) => f,
            Err(e) => {
                tracing::warn!("Vision fallback: capture failed: {}", e);
                return None;
            }
        };

        tracing::info!("Running vision fallback ({} provider)", vision.name());

        let vision_elements = match runtime.block_on(vision.analyze(&frame, "")) {
            Ok(ve) => ve,
            Err(e) => {
                tracing::warn!("Vision fallback: analysis failed: {}", e);
                return None;
            }
        };

        let context_elements: Vec<ContextElement> = vision_elements
            .into_iter()
            .enumerate()
            .map(|(i, ve)| ContextElement {
                id: format!("vision:{}", i),
                label: Some(ve.label),
                element_type: ve.element_type,
                value: None,
                bounds: ve.bounds.map(|b| Bounds {
                    x: b.x,
                    y: b.y,
                    width: b.width,
                    height: b.height,
                }),
                confidence: ve.confidence,
                source: ContextSource::Vision,
            })
            .collect();

        if context_elements.is_empty() {
            None
        } else {
            Some(context_elements)
        }
    }

    /// Detect the foreground application and window title.
    ///
    /// Strategy:
    /// 1. Try the accessibility tree's focused element (most reliable).
    /// 2. Fall back to the display layer's window list (first non-minimized).
    fn detect_foreground(&self) -> (String, String) {
        // Strategy 1: accessibility focused element
        match self.accessibility.focused_element() {
            Ok(Some(focused)) => {
                let label = focused.label.unwrap_or_default();
                if !label.is_empty() {
                    return (label.clone(), label);
                }
            }
            Ok(None) => {}
            Err(e) => {
                tracing::debug!("Could not get focused element: {}", e);
            }
        }

        // Strategy 2: display layer window list
        if let Some(display) = &self.display {
            match display.list_windows() {
                Ok(windows) => {
                    if let Some(fg) = windows.iter().find(|w| !w.is_minimized) {
                        return (fg.app_name.clone(), fg.title.clone());
                    }
                }
                Err(e) => {
                    tracing::warn!("Could not list windows for foreground detection: {}", e);
                }
            }
        }

        (String::new(), String::new())
    }

    /// Merge additional elements from a native adapter (highest confidence).
    pub fn merge_native_elements(&self, base: &mut ScreenContext, native: Vec<ContextElement>) {
        for elem in native {
            // Check if this element already exists (by ID match)
            if let Some(existing) = base.elements.iter_mut().find(|e| e.id == elem.id) {
                // Native API overrides — higher confidence
                if elem.confidence > existing.confidence {
                    *existing = elem;
                }
            } else {
                base.elements.push(elem);
            }
        }
        // Re-sort
        base.elements.sort_by(|a, b| {
            b.confidence
                .partial_cmp(&a.confidence)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
    }

    /// Merge vision-detected elements as fallback (lower confidence).
    pub fn merge_vision_elements(&self, base: &mut ScreenContext, vision: Vec<ContextElement>) {
        for elem in vision {
            // Only add if no existing element covers the same area
            let dominated = base.elements.iter().any(|e| {
                if let (Some(eb), Some(vb)) = (&e.bounds, &elem.bounds) {
                    bounds_overlap(eb, vb) > 0.5
                } else {
                    false
                }
            });
            if !dominated {
                base.elements.push(elem);
            }
        }
    }

    /// Flatten the accessibility tree into a list of ContextElements.
    fn flatten_a11y_tree(&self, node: &AccessibilityElement, out: &mut Vec<ContextElement>) {
        let element_type = role_to_string(&node.role);

        out.push(ContextElement {
            id: node.id.clone(),
            label: node.label.clone(),
            element_type: element_type.to_string(),
            value: node.value.clone(),
            bounds: node.bounds.as_ref().map(|b| Bounds {
                x: b.x,
                y: b.y,
                width: b.width,
                height: b.height,
            }),
            confidence: 0.85, // Default a11y confidence
            source: ContextSource::AccessibilityTree,
        });

        for child in &node.children {
            self.flatten_a11y_tree(child, out);
        }
    }
}

fn role_to_string(role: &ElementRole) -> &str {
    match role {
        ElementRole::Button => "button",
        ElementRole::Input => "input",
        ElementRole::Text => "text",
        ElementRole::Window => "window",
        ElementRole::List => "list",
        ElementRole::ListItem => "list_item",
        ElementRole::Menu => "menu",
        ElementRole::MenuItem => "menu_item",
        ElementRole::Checkbox => "checkbox",
        ElementRole::ComboBox => "combobox",
        ElementRole::Table => "table",
        ElementRole::TableRow => "table_row",
        ElementRole::TableCell => "table_cell",
        ElementRole::Dialog => "dialog",
        ElementRole::Tab => "tab",
        ElementRole::TabItem => "tab_item",
        ElementRole::RadioButton => "radio_button",
        ElementRole::Slider => "slider",
        ElementRole::ScrollBar => "scrollbar",
        ElementRole::TreeView => "tree_view",
        ElementRole::TreeItem => "tree_item",
        ElementRole::Toolbar => "toolbar",
        ElementRole::StatusBar => "status_bar",
        ElementRole::Group => "group",
        ElementRole::Image => "image",
        ElementRole::Link => "link",
        ElementRole::Custom(s) => s.as_str(),
    }
}

/// Whether an element type is "actionable" — interactive elements that an agent can click/type into.
fn is_actionable_type(element_type: &str) -> bool {
    matches!(
        element_type,
        "button"
            | "input"
            | "link"
            | "checkbox"
            | "radio_button"
            | "combobox"
            | "menu_item"
            | "tab_item"
            | "slider"
            | "list_item"
            | "tree_item"
    )
}

/// Compute intersection-over-union of two bounding boxes.
fn bounds_overlap(a: &Bounds, b: &Bounds) -> f64 {
    let ax2 = a.x.saturating_add(a.width as i32);
    let ay2 = a.y.saturating_add(a.height as i32);
    let bx2 = b.x.saturating_add(b.width as i32);
    let by2 = b.y.saturating_add(b.height as i32);

    let ix1 = a.x.max(b.x);
    let iy1 = a.y.max(b.y);
    let ix2 = ax2.min(bx2);
    let iy2 = ay2.min(by2);

    if ix1 >= ix2 || iy1 >= iy2 {
        return 0.0;
    }

    let intersection = (ix2 - ix1) as f64 * (iy2 - iy1) as f64;
    let area_a = a.width as f64 * a.height as f64;
    let area_b = b.width as f64 * b.height as f64;
    let union = area_a + area_b - intersection;

    if union == 0.0 {
        0.0
    } else {
        intersection / union
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bounds_overlap_full() {
        let a = Bounds { x: 0, y: 0, width: 100, height: 100 };
        let b = Bounds { x: 0, y: 0, width: 100, height: 100 };
        assert!((bounds_overlap(&a, &b) - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_bounds_overlap_none() {
        let a = Bounds { x: 0, y: 0, width: 50, height: 50 };
        let b = Bounds { x: 100, y: 100, width: 50, height: 50 };
        assert_eq!(bounds_overlap(&a, &b), 0.0);
    }

    #[test]
    fn test_bounds_overlap_partial() {
        let a = Bounds { x: 0, y: 0, width: 100, height: 100 };
        let b = Bounds { x: 50, y: 50, width: 100, height: 100 };
        let iou = bounds_overlap(&a, &b);
        assert!(iou > 0.0 && iou < 1.0);
    }

    #[test]
    fn test_bounds_overlap_adjacent() {
        let a = Bounds { x: 0, y: 0, width: 50, height: 50 };
        let b = Bounds { x: 50, y: 0, width: 50, height: 50 };
        assert_eq!(bounds_overlap(&a, &b), 0.0);
    }

    #[test]
    fn test_bounds_overlap_contained() {
        let a = Bounds { x: 0, y: 0, width: 200, height: 200 };
        let b = Bounds { x: 50, y: 50, width: 50, height: 50 };
        let iou = bounds_overlap(&a, &b);
        assert!(iou > 0.0 && iou < 0.1);
    }

    #[test]
    fn test_get_context_with_stub() {
        let stub = Box::new(cel_accessibility::StubAccessibility);
        let mut merger = ContextMerger::new(stub);
        let ctx = merger.get_context();
        assert!(!ctx.elements.is_empty());
        assert_eq!(ctx.elements[0].element_type, "window");
        assert_eq!(ctx.elements[0].confidence, 0.85);
        assert_eq!(ctx.elements[0].source, ContextSource::AccessibilityTree);
        assert!(ctx.timestamp_ms > 0);
    }

    #[test]
    fn test_merge_native_elements_overrides_by_id() {
        let stub = Box::new(cel_accessibility::StubAccessibility);
        let merger = ContextMerger::new(stub);
        let mut ctx = ScreenContext {
            app: "".into(), window: "".into(), network_events: vec![], timestamp_ms: 0,
            elements: vec![ContextElement {
                id: "root".into(),
                label: Some("Stub Window".into()),
                element_type: "window".into(),
                value: None,
                bounds: None,
                confidence: 0.85,
                source: ContextSource::AccessibilityTree,
            }],
        };

        let native = vec![ContextElement {
            id: "root".into(),
            label: Some("Excel".into()),
            element_type: "window".into(),
            value: None,
            bounds: None,
            confidence: 0.98,
            source: ContextSource::NativeApi,
        }];

        merger.merge_native_elements(&mut ctx, native);
        let root = ctx.elements.iter().find(|e| e.id == "root").unwrap();
        assert_eq!(root.confidence, 0.98);
        assert_eq!(root.source, ContextSource::NativeApi);
        assert_eq!(root.label.as_deref(), Some("Excel"));
    }

    #[test]
    fn test_merge_native_elements_adds_new() {
        let stub = Box::new(cel_accessibility::StubAccessibility);
        let merger = ContextMerger::new(stub);
        let mut ctx = ScreenContext {
            app: "".into(), window: "".into(), network_events: vec![], timestamp_ms: 0,
            elements: vec![ContextElement {
                id: "root".into(),
                label: None,
                element_type: "window".into(),
                value: None,
                bounds: None,
                confidence: 0.85,
                source: ContextSource::AccessibilityTree,
            }],
        };
        let initial_count = ctx.elements.len();

        let native = vec![ContextElement {
            id: "excel:A1".into(),
            label: Some("Cell A1".into()),
            element_type: "table_cell".into(),
            value: Some("Revenue".into()),
            bounds: Some(Bounds { x: 120, y: 200, width: 80, height: 20 }),
            confidence: 0.98,
            source: ContextSource::NativeApi,
        }];

        merger.merge_native_elements(&mut ctx, native);
        assert_eq!(ctx.elements.len(), initial_count + 1);
        assert_eq!(ctx.elements[0].confidence, 0.98);
    }

    #[test]
    fn test_merge_vision_elements_no_overlap() {
        let stub = Box::new(cel_accessibility::StubAccessibility);
        let merger = ContextMerger::new(stub);
        let mut ctx = ScreenContext {
            app: "test".into(),
            window: "test".into(),
            network_events: vec![],
            elements: vec![],
            timestamp_ms: 0,
        };

        let vision = vec![ContextElement {
            id: "vision:btn:1".into(),
            label: Some("Submit".into()),
            element_type: "button".into(),
            value: None,
            bounds: Some(Bounds { x: 500, y: 500, width: 100, height: 40 }),
            confidence: 0.75,
            source: ContextSource::Vision,
        }];

        merger.merge_vision_elements(&mut ctx, vision);
        assert_eq!(ctx.elements.len(), 1);
    }

    #[test]
    fn test_merge_vision_elements_dominated_by_existing() {
        let stub = Box::new(cel_accessibility::StubAccessibility);
        let merger = ContextMerger::new(stub);
        let mut ctx = ScreenContext {
            app: "test".into(),
            window: "test".into(),
            network_events: vec![],
            elements: vec![ContextElement {
                id: "a11y:btn:1".into(),
                label: Some("OK".into()),
                element_type: "button".into(),
                value: None,
                bounds: Some(Bounds { x: 100, y: 100, width: 80, height: 30 }),
                confidence: 0.85,
                source: ContextSource::AccessibilityTree,
            }],
            timestamp_ms: 0,
        };

        let vision = vec![ContextElement {
            id: "vision:btn:1".into(),
            label: Some("OK".into()),
            element_type: "button".into(),
            value: None,
            bounds: Some(Bounds { x: 100, y: 100, width: 80, height: 30 }),
            confidence: 0.70,
            source: ContextSource::Vision,
        }];

        merger.merge_vision_elements(&mut ctx, vision);
        assert_eq!(ctx.elements.len(), 1);
    }

    #[test]
    fn test_elements_sorted_by_confidence() {
        let stub = Box::new(cel_accessibility::StubAccessibility);
        let merger = ContextMerger::new(stub);
        let mut ctx = ScreenContext {
            app: "".into(), window: "".into(), network_events: vec![], timestamp_ms: 0,
            elements: vec![ContextElement {
                id: "root".into(), label: None, element_type: "window".into(),
                value: None, bounds: None, confidence: 0.85,
                source: ContextSource::AccessibilityTree,
            }],
        };

        let native = vec![
            ContextElement {
                id: "low".into(), label: None, element_type: "text".into(),
                value: None, bounds: None, confidence: 0.50,
                source: ContextSource::NativeApi,
            },
            ContextElement {
                id: "high".into(), label: None, element_type: "button".into(),
                value: None, bounds: None, confidence: 0.99,
                source: ContextSource::NativeApi,
            },
        ];

        merger.merge_native_elements(&mut ctx, native);
        for i in 0..ctx.elements.len() - 1 {
            assert!(ctx.elements[i].confidence >= ctx.elements[i + 1].confidence);
        }
    }

    #[test]
    fn test_role_to_string_all_variants() {
        let mappings = vec![
            (ElementRole::Button, "button"),
            (ElementRole::Input, "input"),
            (ElementRole::Text, "text"),
            (ElementRole::Window, "window"),
            (ElementRole::List, "list"),
            (ElementRole::ListItem, "list_item"),
            (ElementRole::Menu, "menu"),
            (ElementRole::MenuItem, "menu_item"),
            (ElementRole::Checkbox, "checkbox"),
            (ElementRole::ComboBox, "combobox"),
            (ElementRole::Table, "table"),
            (ElementRole::TableRow, "table_row"),
            (ElementRole::TableCell, "table_cell"),
            (ElementRole::Dialog, "dialog"),
            (ElementRole::Tab, "tab"),
            (ElementRole::TabItem, "tab_item"),
            (ElementRole::RadioButton, "radio_button"),
            (ElementRole::Slider, "slider"),
            (ElementRole::ScrollBar, "scrollbar"),
            (ElementRole::TreeView, "tree_view"),
            (ElementRole::TreeItem, "tree_item"),
            (ElementRole::Toolbar, "toolbar"),
            (ElementRole::StatusBar, "status_bar"),
            (ElementRole::Group, "group"),
            (ElementRole::Image, "image"),
            (ElementRole::Link, "link"),
            (ElementRole::Custom("widget".into()), "widget"),
        ];
        for (role, expected) in mappings {
            assert_eq!(role_to_string(&role), expected);
        }
    }

    #[test]
    fn test_recent_network_events_empty() {
        let stub = Box::new(cel_accessibility::StubAccessibility);
        let merger = ContextMerger::new(stub);
        assert!(merger.recent_network_events().is_empty());
    }

    #[test]
    fn test_with_all_constructor() {
        let a11y = Box::new(cel_accessibility::StubAccessibility);
        let net = Box::new(cel_network::StubNetworkMonitor);

        // We can't easily construct a stub ScreenCapture, so test network path manually
        let merger = ContextMerger {
            accessibility: a11y,
            display: None,
            network: Some(net),
            vision: None,
            recent_network: Vec::new(),
            runtime: None,
        };
        assert!(merger.recent_network_events().is_empty());
    }

    #[test]
    fn test_is_actionable_type() {
        assert!(is_actionable_type("button"));
        assert!(is_actionable_type("input"));
        assert!(is_actionable_type("link"));
        assert!(is_actionable_type("checkbox"));
        assert!(is_actionable_type("radio_button"));
        assert!(is_actionable_type("combobox"));
        assert!(is_actionable_type("menu_item"));
        assert!(is_actionable_type("tab_item"));
        assert!(is_actionable_type("slider"));
        assert!(is_actionable_type("list_item"));
        assert!(is_actionable_type("tree_item"));
        assert!(!is_actionable_type("window"));
        assert!(!is_actionable_type("text"));
        assert!(!is_actionable_type("group"));
        assert!(!is_actionable_type("table"));
        assert!(!is_actionable_type("dialog"));
        assert!(!is_actionable_type("toolbar"));
        assert!(!is_actionable_type("status_bar"));
        assert!(!is_actionable_type("image"));
        assert!(!is_actionable_type(""));
        assert!(!is_actionable_type("unknown_type"));
    }

    #[test]
    fn test_bounds_overlap_iou_value() {
        // 50% overlap: two 100x100 boxes offset by 50px
        let a = Bounds { x: 0, y: 0, width: 100, height: 100 };
        let b = Bounds { x: 50, y: 0, width: 100, height: 100 };
        let iou = bounds_overlap(&a, &b);
        // Intersection: 50x100 = 5000, Union: 10000 + 10000 - 5000 = 15000
        let expected = 5000.0 / 15000.0;
        assert!((iou - expected).abs() < 0.01, "Expected IoU ~{:.3}, got {:.3}", expected, iou);
    }

    #[test]
    fn test_bounds_overlap_zero_area() {
        let a = Bounds { x: 10, y: 10, width: 0, height: 0 };
        let b = Bounds { x: 10, y: 10, width: 0, height: 0 };
        assert_eq!(bounds_overlap(&a, &b), 0.0, "Zero-area bounds should have 0 IoU");
    }

    #[test]
    fn test_merge_vision_preserves_source_and_confidence() {
        let stub = Box::new(cel_accessibility::StubAccessibility);
        let merger = ContextMerger::new(stub);
        let mut ctx = ScreenContext {
            app: "test".into(), window: "test".into(),
            network_events: vec![], elements: vec![], timestamp_ms: 0,
        };

        let vision = vec![
            ContextElement {
                id: "vision:0".into(),
                label: Some("Submit".into()),
                element_type: "button".into(),
                value: None,
                bounds: Some(Bounds { x: 100, y: 200, width: 80, height: 30 }),
                confidence: 0.72,
                source: ContextSource::Vision,
            },
            ContextElement {
                id: "vision:1".into(),
                label: Some("Cancel".into()),
                element_type: "button".into(),
                value: None,
                bounds: Some(Bounds { x: 200, y: 200, width: 80, height: 30 }),
                confidence: 0.68,
                source: ContextSource::Vision,
            },
        ];

        merger.merge_vision_elements(&mut ctx, vision);

        assert_eq!(ctx.elements.len(), 2);
        for e in &ctx.elements {
            assert_eq!(e.source, ContextSource::Vision);
            assert!(e.confidence < 0.85, "Vision elements should have lower confidence");
            assert!(e.bounds.is_some(), "Vision elements should have bounds");
            assert!(e.label.is_some(), "Vision elements should have labels");
        }
    }

    #[test]
    fn test_merge_native_does_not_lower_confidence() {
        let stub = Box::new(cel_accessibility::StubAccessibility);
        let merger = ContextMerger::new(stub);
        let mut ctx = ScreenContext {
            app: "".into(), window: "".into(), network_events: vec![], timestamp_ms: 0,
            elements: vec![ContextElement {
                id: "btn1".into(),
                label: Some("OK".into()),
                element_type: "button".into(),
                value: None, bounds: None,
                confidence: 0.95,
                source: ContextSource::AccessibilityTree,
            }],
        };

        // Native element with LOWER confidence should NOT override
        let native = vec![ContextElement {
            id: "btn1".into(),
            label: Some("OK (native)".into()),
            element_type: "button".into(),
            value: None, bounds: None,
            confidence: 0.80,
            source: ContextSource::NativeApi,
        }];

        merger.merge_native_elements(&mut ctx, native);
        let btn = ctx.elements.iter().find(|e| e.id == "btn1").unwrap();
        // Original 0.95 should be preserved since it's higher
        assert_eq!(btn.confidence, 0.95);
        assert_eq!(btn.source, ContextSource::AccessibilityTree);
    }

    #[test]
    fn test_context_timestamp_is_nonzero() {
        let stub = Box::new(cel_accessibility::StubAccessibility);
        let mut merger = ContextMerger::new(stub);
        let ctx = merger.get_context();
        assert!(ctx.timestamp_ms > 0, "Context should have a real timestamp");
        // Should be a recent epoch-ms value (after 2020-01-01)
        assert!(ctx.timestamp_ms > 1_577_836_800_000);
    }

    #[test]
    fn test_flatten_a11y_tree_sets_correct_confidence() {
        let stub = Box::new(cel_accessibility::StubAccessibility);
        let mut merger = ContextMerger::new(stub);
        let ctx = merger.get_context();

        // All a11y elements should have the default 0.85 confidence
        for e in &ctx.elements {
            assert_eq!(e.confidence, 0.85);
            assert_eq!(e.source, ContextSource::AccessibilityTree);
        }
    }

    #[test]
    fn test_role_to_string_covers_all_roles() {
        // Ensure no role maps to empty string
        let roles = vec![
            ElementRole::Button, ElementRole::Input, ElementRole::Text,
            ElementRole::Window, ElementRole::List, ElementRole::ListItem,
            ElementRole::Menu, ElementRole::MenuItem, ElementRole::Checkbox,
            ElementRole::ComboBox, ElementRole::Table, ElementRole::TableRow,
            ElementRole::TableCell, ElementRole::Dialog, ElementRole::Tab,
            ElementRole::TabItem, ElementRole::RadioButton, ElementRole::Slider,
            ElementRole::ScrollBar, ElementRole::TreeView, ElementRole::TreeItem,
            ElementRole::Toolbar, ElementRole::StatusBar, ElementRole::Group,
            ElementRole::Image, ElementRole::Link,
            ElementRole::Custom("custom_widget".into()),
        ];

        for role in &roles {
            let s = role_to_string(role);
            assert!(!s.is_empty(), "role_to_string({:?}) returned empty string", role);
            assert!(!s.contains(' '), "role_to_string({:?}) contains spaces: '{}'", role, s);
        }
    }
}
