//! CEL Accessibility Layer
//!
//! Bridges platform accessibility APIs into a unified element tree.
//! Windows: UI Automation. macOS: AXUIElement.

mod tree;

#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "macos")]
mod macos;

pub use tree::{AccessibilityElement, AccessibilityError, AccessibilityTree, ElementRole, ElementState};

/// Create a platform-appropriate accessibility tree provider.
pub fn create_tree() -> Box<dyn AccessibilityTree> {
    #[cfg(target_os = "windows")]
    {
        Box::new(windows::WindowsAccessibility::new())
    }
    #[cfg(target_os = "macos")]
    {
        Box::new(macos::MacAccessibility::new())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Box::new(tree::StubAccessibility)
    }
}
