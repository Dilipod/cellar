use crate::element::{Bounds, ContextElement, ContextSource, ScreenContext};
use cel_accessibility::{AccessibilityElement, AccessibilityTree, ElementRole};

/// Merges context from all available streams into a unified ScreenContext.
pub struct ContextMerger {
    accessibility: Box<dyn AccessibilityTree>,
}

impl ContextMerger {
    pub fn new(accessibility: Box<dyn AccessibilityTree>) -> Self {
        Self { accessibility }
    }

    /// Build a unified context by querying all available streams.
    ///
    /// Priority order:
    /// 1. Native API (highest confidence, when adapter available)
    /// 2. Accessibility tree (structured, reliable on modern apps)
    /// 3. Vision (fallback, used when others are insufficient)
    pub fn get_context(&self) -> ScreenContext {
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

        // Sort by confidence (highest first)
        elements.sort_by(|a, b| {
            b.confidence
                .partial_cmp(&a.confidence)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        ScreenContext {
            app: String::new(),   // TODO: detect foreground app
            window: String::new(), // TODO: detect active window title
            elements,
            timestamp_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        }
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

/// Compute intersection-over-union of two bounding boxes.
fn bounds_overlap(a: &Bounds, b: &Bounds) -> f64 {
    let ax2 = a.x + a.width as i32;
    let ay2 = a.y + a.height as i32;
    let bx2 = b.x + b.width as i32;
    let by2 = b.y + b.height as i32;

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
        // Touching but not overlapping
        let a = Bounds { x: 0, y: 0, width: 50, height: 50 };
        let b = Bounds { x: 50, y: 0, width: 50, height: 50 };
        assert_eq!(bounds_overlap(&a, &b), 0.0);
    }

    #[test]
    fn test_bounds_overlap_contained() {
        // b fully contained in a
        let a = Bounds { x: 0, y: 0, width: 200, height: 200 };
        let b = Bounds { x: 50, y: 50, width: 50, height: 50 };
        let iou = bounds_overlap(&a, &b);
        // IoU = 2500 / (40000 + 2500 - 2500) = 2500 / 40000 = 0.0625
        assert!(iou > 0.0 && iou < 0.1);
    }

    #[test]
    fn test_get_context_with_stub() {
        let stub = Box::new(cel_accessibility::StubAccessibility);
        let merger = ContextMerger::new(stub);
        let ctx = merger.get_context();
        // Stub returns a root window element
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
        let mut ctx = merger.get_context();

        let native = vec![ContextElement {
            id: "root".into(), // Same ID as stub root
            label: Some("Excel".into()),
            element_type: "window".into(),
            value: None,
            bounds: None,
            confidence: 0.98,
            source: ContextSource::NativeApi,
        }];

        merger.merge_native_elements(&mut ctx, native);
        let root = ctx.elements.iter().find(|e| e.id == "root").unwrap();
        assert_eq!(root.confidence, 0.98); // Overridden
        assert_eq!(root.source, ContextSource::NativeApi);
        assert_eq!(root.label.as_deref(), Some("Excel"));
    }

    #[test]
    fn test_merge_native_elements_adds_new() {
        let stub = Box::new(cel_accessibility::StubAccessibility);
        let merger = ContextMerger::new(stub);
        let mut ctx = merger.get_context();
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
        // Highest confidence should be first after sort
        assert_eq!(ctx.elements[0].confidence, 0.98);
    }

    #[test]
    fn test_merge_vision_elements_no_overlap() {
        let stub = Box::new(cel_accessibility::StubAccessibility);
        let merger = ContextMerger::new(stub);
        let mut ctx = ScreenContext {
            app: "test".into(),
            window: "test".into(),
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

        // Vision element in same location — should NOT be added (IoU > 0.5)
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
        assert_eq!(ctx.elements.len(), 1); // Not added — dominated
    }

    #[test]
    fn test_elements_sorted_by_confidence() {
        let stub = Box::new(cel_accessibility::StubAccessibility);
        let merger = ContextMerger::new(stub);
        let mut ctx = merger.get_context();

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
        // Should be sorted descending by confidence
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
}
