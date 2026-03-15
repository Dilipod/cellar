use crate::tree::{AccessibilityElement, AccessibilityError, AccessibilityTree, ElementRole};

/// macOS accessibility using AXUIElement.
pub struct MacAccessibility;

impl MacAccessibility {
    pub fn new() -> Self {
        Self
    }
}

impl AccessibilityTree for MacAccessibility {
    fn get_tree(&self) -> Result<AccessibilityElement, AccessibilityError> {
        // TODO: AXUIElementCreateSystemWide → focused app → walk AXChildren
        Err(AccessibilityError::QueryFailed("Not yet implemented".into()))
    }

    fn find_elements(
        &self,
        _role: Option<&ElementRole>,
        _label: Option<&str>,
    ) -> Result<Vec<AccessibilityElement>, AccessibilityError> {
        // TODO: Walk tree and filter by AXRole / AXTitle
        Err(AccessibilityError::QueryFailed("Not yet implemented".into()))
    }

    fn focused_element(&self) -> Result<Option<AccessibilityElement>, AccessibilityError> {
        // TODO: AXUIElementCopyAttributeValue with kAXFocusedUIElementAttribute
        Err(AccessibilityError::QueryFailed("Not yet implemented".into()))
    }
}
