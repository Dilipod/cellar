//! CEL Accessibility Layer
//!
//! Bridges platform accessibility APIs into a unified element tree.
//! - Windows: UI Automation (requires `uiautomation` crate — added when targeting Windows)
//! - macOS: AXUIElement (requires `objc2` + `core-foundation` — added when targeting macOS)
//! - Linux: Stub (AT-SPI2 support planned)
//!
//! The tree types and trait are platform-agnostic. Platform implementations
//! are added as the target OS supports them.

mod tree;

pub use tree::{
    AccessibilityElement, AccessibilityError, AccessibilityTree, Bounds, ElementRole, ElementState,
    StubAccessibility,
};

/// Create a platform-appropriate accessibility tree provider.
pub fn create_tree() -> Box<dyn AccessibilityTree> {
    // TODO: On Windows, return WindowsAccessibility (UIA)
    // TODO: On macOS, return MacAccessibility (AXUIElement)
    // For now, return stub on all platforms
    Box::new(StubAccessibility)
}
