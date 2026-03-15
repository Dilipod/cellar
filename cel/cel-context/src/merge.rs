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
}
