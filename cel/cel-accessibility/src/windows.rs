use crate::tree::{AccessibilityElement, AccessibilityError, AccessibilityTree, ElementRole};

/// Windows accessibility using UI Automation.
pub struct WindowsAccessibility;

impl WindowsAccessibility {
    pub fn new() -> Self {
        Self
    }
}

impl AccessibilityTree for WindowsAccessibility {
    fn get_tree(&self) -> Result<AccessibilityElement, AccessibilityError> {
        // TODO: CoCreateInstance IUIAutomation → GetRootElement → walk tree
        Err(AccessibilityError::QueryFailed("Not yet implemented".into()))
    }

    fn find_elements(
        &self,
        _role: Option<&ElementRole>,
        _label: Option<&str>,
    ) -> Result<Vec<AccessibilityElement>, AccessibilityError> {
        // TODO: IUIAutomation::CreatePropertyCondition → FindAll
        Err(AccessibilityError::QueryFailed("Not yet implemented".into()))
    }

    fn focused_element(&self) -> Result<Option<AccessibilityElement>, AccessibilityError> {
        // TODO: IUIAutomation::GetFocusedElement
        Err(AccessibilityError::QueryFailed("Not yet implemented".into()))
    }
}
