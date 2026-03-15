use crate::element::{ContextElement, ContextSource, ScreenContext};
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
        elements.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));

        ScreenContext {
            app: String::new(), // TODO: detect foreground app
            window: String::new(), // TODO: detect active window title
            elements,
            timestamp_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        }
    }

    /// Flatten the accessibility tree into a list of ContextElements.
    fn flatten_a11y_tree(
        &self,
        node: &AccessibilityElement,
        out: &mut Vec<ContextElement>,
    ) {
        let element_type = match &node.role {
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
            _ => "unknown",
        };

        out.push(ContextElement {
            id: node.id.clone(),
            label: node.label.clone(),
            element_type: element_type.to_string(),
            value: node.value.clone(),
            bounds: node.bounds.as_ref().map(|b| crate::element::Bounds {
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
