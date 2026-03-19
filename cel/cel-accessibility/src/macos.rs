//! macOS Accessibility Bridge via AXUIElement API
//!
//! Uses Apple's Accessibility framework (ApplicationServices) to read the
//! accessibility tree of the focused application. Requires the calling process
//! to have Accessibility permission granted in System Settings.

use crate::tree::*;
use core_foundation::array::CFArray;
use core_foundation::base::{CFType, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::number::CFNumber;
use core_foundation::string::{CFString, CFStringRef};
use std::ffi::c_void;
use std::ptr;
use std::time::Duration;

/// Opaque type for AXUIElement.
#[repr(C)]
pub struct __AXUIElement(c_void);
pub type AXUIElementRef = *const __AXUIElement;

/// AXError codes.
pub type AXError = i32;
pub const K_AX_ERROR_SUCCESS: AXError = 0;
pub const K_AX_ERROR_API_DISABLED: AXError = -25211;
pub const K_AX_ERROR_NO_VALUE: AXError = -25212;
pub const K_AX_ERROR_NOT_IMPLEMENTED: AXError = -25208;
pub const K_AX_ERROR_ATTRIBUTE_UNSUPPORTED: AXError = -25205;

// Treat AXUIElementRef as a CFType for memory management
use core_foundation::base::CFTypeRef;

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXUIElementCreateSystemWide() -> AXUIElementRef;
    fn AXUIElementCreateApplication(pid: i32) -> AXUIElementRef;
    fn AXUIElementCopyAttributeValue(
        element: AXUIElementRef,
        attribute: CFStringRef,
        value: *mut CFTypeRef,
    ) -> AXError;
    fn AXUIElementCopyActionNames(
        element: AXUIElementRef,
        names: *mut CFTypeRef,
    ) -> AXError;
    fn AXUIElementGetPid(element: AXUIElementRef, pid: *mut i32) -> AXError;
    fn AXIsProcessTrusted() -> bool;
    fn CFRelease(cf: *const c_void);
    fn CFRetain(cf: *const c_void) -> *const c_void;
}

const MAX_TREE_DEPTH: usize = 15;
const MAX_ELEMENTS: usize = 500;
const _AX_TIMEOUT: Duration = Duration::from_secs(2);

/// macOS accessibility provider using the AXUIElement API.
pub struct MacAccessibility;

impl MacAccessibility {
    pub fn new() -> Result<Self, AccessibilityError> {
        if !unsafe { AXIsProcessTrusted() } {
            return Err(AccessibilityError::QueryFailed(
                "Accessibility permission not granted. Go to System Settings > Privacy & Security > Accessibility and add this application.".into()
            ));
        }
        Ok(Self)
    }

    /// Get the PID of the focused application.
    /// Tries AXUIElement system-wide first, falls back to NSWorkspace frontmostApplication.
    fn get_focused_app_pid(&self) -> Result<i32, AccessibilityError> {
        // Try 1: AXUIElement system-wide focused application
        let system_wide = unsafe { AXUIElementCreateSystemWide() };
        if !system_wide.is_null() {
            let focused_app = get_ax_attribute(system_wide, "AXFocusedApplication");
            unsafe { CFRelease(system_wide as *const c_void) };

            if let Some(focused_app) = focused_app {
                let app_ref = focused_app.as_CFTypeRef() as AXUIElementRef;
                let mut pid: i32 = 0;
                let err = unsafe { AXUIElementGetPid(app_ref, &mut pid) };
                if err == K_AX_ERROR_SUCCESS && pid > 0 {
                    return Ok(pid);
                }
            }
        }

        // Try 2: Use NSWorkspace to get frontmost application PID
        // This works even when the AX system-wide query fails
        let output = std::process::Command::new("osascript")
            .args(["-e", "tell application \"System Events\" to unix id of first process whose frontmost is true"])
            .output()
            .map_err(|e| AccessibilityError::QueryFailed(format!("osascript failed: {}", e)))?;

        if output.status.success() {
            let pid_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let pid: i32 = pid_str.parse().map_err(|_| {
                AccessibilityError::QueryFailed(format!("Failed to parse PID: {}", pid_str))
            })?;
            return Ok(pid);
        }

        Err(AccessibilityError::QueryFailed(
            "Could not determine focused application PID".into(),
        ))
    }

    /// Recursively build the accessibility tree from an AXUIElement.
    /// `deadline` prevents the traversal from taking too long on heavy pages.
    fn build_element(
        &self,
        element: AXUIElementRef,
        parent_id: Option<&str>,
        depth: usize,
        count: &mut usize,
        deadline: &std::time::Instant,
    ) -> Option<AccessibilityElement> {
        if depth >= MAX_TREE_DEPTH || *count >= MAX_ELEMENTS || element.is_null() {
            return None;
        }
        // Timeout check — stop traversal if we've exceeded the deadline
        if std::time::Instant::now() > *deadline {
            tracing::debug!("AX tree traversal hit timeout at depth {}, count {}", depth, *count);
            return None;
        }
        *count += 1;

        // Role
        let role_str = get_ax_string(element, "AXRole").unwrap_or_default();
        let subrole = get_ax_string(element, "AXSubrole");
        let role = map_role(&role_str, subrole.as_deref());

        // Label
        let label = get_ax_string(element, "AXTitle")
            .or_else(|| get_ax_string(element, "AXDescription"))
            .or_else(|| get_ax_string(element, "AXHelp"));

        // Description
        let description = get_ax_string(element, "AXHelp");

        // Value
        let value = get_ax_string(element, "AXValue");

        // Bounds
        let bounds = get_ax_bounds(element);

        // State
        let state = get_ax_state(element, &role_str);

        // Actions
        let actions = get_ax_actions(element);

        // Filter out empty text elements and spacers early
        if role_str == "AXStaticText"
            && label.as_deref().map_or(true, |l| l.trim().is_empty())
            && value.as_deref().map_or(true, |v| v.trim().is_empty())
        {
            return None;
        }

        // Generate stable ID from content hash (not pointer address).
        // This ensures the same element gets the same ID across queries.
        let id = {
            use std::collections::hash_map::DefaultHasher;
            use std::hash::{Hash, Hasher};
            let mut hasher = DefaultHasher::new();
            role_str.hash(&mut hasher);
            label.hash(&mut hasher);
            if let Some(ref b) = bounds {
                b.x.hash(&mut hasher);
                b.y.hash(&mut hasher);
                b.width.hash(&mut hasher);
                b.height.hash(&mut hasher);
            }
            depth.hash(&mut hasher);
            (*count).hash(&mut hasher); // disambiguate identical siblings
            format!("ax:{:016x}", hasher.finish())
        };

        // Children
        let mut children = Vec::new();
        if depth + 1 < MAX_TREE_DEPTH && *count < MAX_ELEMENTS {
            if let Some(kids_cf) = get_ax_attribute(element, "AXChildren") {
                let kids_ref = kids_cf.as_CFTypeRef();
                if unsafe { core_foundation::array::CFArrayGetTypeID() }
                    == unsafe { core_foundation::base::CFGetTypeID(kids_ref) }
                {
                    let arr: CFArray<CFType> = unsafe {
                        CFArray::wrap_under_get_rule(kids_ref as core_foundation::array::CFArrayRef)
                    };
                    for i in 0..arr.len() {
                        if *count >= MAX_ELEMENTS {
                            break;
                        }
                        let child_ref = arr.get(i).map(|c| c.as_CFTypeRef() as AXUIElementRef);
                        if let Some(child_el) = child_ref {
                            if let Some(child) = self.build_element(child_el, Some(&id), depth + 1, count, deadline) {
                                children.push(child);
                            }
                        }
                    }
                }
            }
        }

        Some(AccessibilityElement {
            id,
            role,
            label,
            description,
            value,
            bounds,
            state,
            parent_id: parent_id.map(|s| s.to_string()),
            actions,
            children,
        })
    }
}

impl MacAccessibility {
    /// Build the full tree for a given PID.
    fn build_tree_for_pid(&self, pid: i32) -> Result<AccessibilityElement, AccessibilityError> {
        let app = unsafe { AXUIElementCreateApplication(pid) };
        if app.is_null() {
            return Err(AccessibilityError::QueryFailed("Failed to create app element".into()));
        }

        let app_label = get_ax_string(app, "AXTitle");

        let window_cf = get_ax_attribute(app, "AXFocusedWindow");
        let window_ref = window_cf
            .as_ref()
            .map(|w| w.as_CFTypeRef() as AXUIElementRef);

        let target = window_ref.unwrap_or(app);

        let mut count = 0;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
        let root = self.build_element(target, None, 0, &mut count, &deadline);

        unsafe { CFRelease(app as *const c_void) };

        match root {
            Some(mut elem) => {
                if elem.role == ElementRole::Window || matches!(elem.role, ElementRole::Custom(_)) {
                    if let Some(name) = &app_label {
                        if elem.label.is_none() || elem.label.as_deref() == Some("") {
                            elem.label = Some(name.clone());
                        }
                    }
                }
                Ok(elem)
            }
            None => Err(AccessibilityError::QueryFailed(
                "Failed to build tree from focused window".into(),
            )),
        }
    }
}

/// Count actionable elements (buttons, inputs, links, etc.) in a tree.
fn count_actionable(el: &AccessibilityElement) -> usize {
    let self_actionable = matches!(
        el.role,
        ElementRole::Button
            | ElementRole::Input
            | ElementRole::Link
            | ElementRole::Checkbox
            | ElementRole::RadioButton
            | ElementRole::ComboBox
            | ElementRole::Slider
            | ElementRole::MenuItem
            | ElementRole::Tab
            | ElementRole::TabItem
    );
    let children_count: usize = el.children.iter().map(count_actionable).sum();
    (if self_actionable { 1 } else { 0 }) + children_count
}

impl AccessibilityTree for MacAccessibility {
    fn get_tree(&self) -> Result<AccessibilityElement, AccessibilityError> {
        let pid = self.get_focused_app_pid()?;

        // Query the tree, with a warmup retry for Chromium/Electron apps.
        // Chromium lazily builds its AX tree on first access, so the first
        // query often returns a shallow result (just groups + traffic lights).
        // A second query after a short delay gets the full web content.
        let mut elem = self.build_tree_for_pid(pid)?;
        let actionable = count_actionable(&elem);
        if actionable < 5 {
            // Likely a lazy-loading app — wait briefly and retry
            std::thread::sleep(std::time::Duration::from_millis(150));
            if let Ok(retry) = self.build_tree_for_pid(pid) {
                let retry_actionable = count_actionable(&retry);
                if retry_actionable > actionable {
                    elem = retry;
                }
            }
        }

        Ok(elem)
    }

    fn find_elements(
        &self,
        role: Option<&ElementRole>,
        label: Option<&str>,
    ) -> Result<Vec<AccessibilityElement>, AccessibilityError> {
        let tree = self.get_tree()?;
        let mut results = Vec::new();
        find_in_tree(&tree, role, label, &mut results);
        Ok(results)
    }

    fn focused_element(&self) -> Result<Option<AccessibilityElement>, AccessibilityError> {
        let system_wide = unsafe { AXUIElementCreateSystemWide() };
        if system_wide.is_null() {
            return Ok(None);
        }

        let focused_cf = get_ax_attribute(system_wide, "AXFocusedUIElement");
        unsafe { CFRelease(system_wide as *const c_void) };

        let focused_ref = match focused_cf {
            Some(ref cf) => cf.as_CFTypeRef() as AXUIElementRef,
            None => return Ok(None),
        };

        let mut count = 0;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(1);
        Ok(self.build_element(focused_ref, None, 0, &mut count, &deadline))
    }
}

// --- Helper functions ---

/// Get an AX attribute as a CFType.
fn get_ax_attribute(element: AXUIElementRef, attr: &str) -> Option<CFType> {
    let attr_cf = CFString::new(attr);
    let mut value: CFTypeRef = ptr::null();
    let err = unsafe {
        AXUIElementCopyAttributeValue(element, attr_cf.as_concrete_TypeRef(), &mut value)
    };
    if err != K_AX_ERROR_SUCCESS || value.is_null() {
        return None;
    }
    // We own the value (Copy rule), wrap it
    Some(unsafe { CFType::wrap_under_create_rule(value) })
}

/// Get an AX attribute as a String.
fn get_ax_string(element: AXUIElementRef, attr: &str) -> Option<String> {
    let cf = get_ax_attribute(element, attr)?;
    let cf_ref = cf.as_CFTypeRef();
    // Check if it's a CFString
    if unsafe { core_foundation::string::CFStringGetTypeID() }
        == unsafe { core_foundation::base::CFGetTypeID(cf_ref) }
    {
        let s: CFString = unsafe { CFString::wrap_under_get_rule(cf_ref as CFStringRef) };
        let result = s.to_string();
        if result.is_empty() {
            None
        } else {
            Some(result)
        }
    } else if unsafe { core_foundation::number::CFNumberGetTypeID() }
        == unsafe { core_foundation::base::CFGetTypeID(cf_ref) }
    {
        // Sometimes AXValue is a number (e.g., checkbox state)
        let n: CFNumber = unsafe {
            CFNumber::wrap_under_get_rule(cf_ref as core_foundation::number::CFNumberRef)
        };
        n.to_f64().map(|v| v.to_string())
    } else {
        None
    }
}

/// Get an AX attribute as a bool.
fn get_ax_bool(element: AXUIElementRef, attr: &str) -> Option<bool> {
    let cf = get_ax_attribute(element, attr)?;
    let cf_ref = cf.as_CFTypeRef();
    if unsafe { core_foundation::boolean::CFBooleanGetTypeID() }
        == unsafe { core_foundation::base::CFGetTypeID(cf_ref) }
    {
        let b: CFBoolean = unsafe {
            CFBoolean::wrap_under_get_rule(cf_ref as core_foundation::boolean::CFBooleanRef)
        };
        Some(b == CFBoolean::true_value())
    } else {
        // Sometimes it's a number 0/1
        get_ax_string(element, attr).and_then(|s| match s.as_str() {
            "1" => Some(true),
            "0" => Some(false),
            _ => None,
        })
    }
}

/// Get element bounds from AXPosition + AXSize.
fn get_ax_bounds(element: AXUIElementRef) -> Option<Bounds> {
    // AXPosition and AXSize return AXValue types that wrap CGPoint/CGSize
    let pos_cf = get_ax_attribute(element, "AXPosition")?;
    let size_cf = get_ax_attribute(element, "AXSize")?;

    let mut point = core_graphics::geometry::CGPoint::new(0.0, 0.0);
    let mut size = core_graphics::geometry::CGSize::new(0.0, 0.0);

    let pos_ok = unsafe {
        AXValueGetValue(
            pos_cf.as_CFTypeRef() as AXValueRef,
            AX_VALUE_TYPE_CG_POINT,
            &mut point as *mut _ as *mut c_void,
        )
    };
    let size_ok = unsafe {
        AXValueGetValue(
            size_cf.as_CFTypeRef() as AXValueRef,
            AX_VALUE_TYPE_CG_SIZE,
            &mut size as *mut _ as *mut c_void,
        )
    };

    if pos_ok && size_ok && size.width > 0.0 && size.height > 0.0 {
        Some(Bounds {
            x: point.x as i32,
            y: point.y as i32,
            width: size.width as u32,
            height: size.height as u32,
        })
    } else {
        None
    }
}

/// Get element state.
fn get_ax_state(element: AXUIElementRef, role: &str) -> ElementState {
    let focused = get_ax_bool(element, "AXFocused").unwrap_or(false);
    let enabled = get_ax_bool(element, "AXEnabled").unwrap_or(true);
    let hidden = get_ax_bool(element, "AXHidden").unwrap_or(false);
    let selected = get_ax_bool(element, "AXSelected").unwrap_or(false);

    let expanded = if role == "AXDisclosureTriangle" || role == "AXOutline" || role == "AXGroup" {
        get_ax_bool(element, "AXExpanded")
    } else {
        None
    };

    let checked = if role == "AXCheckBox" || role == "AXRadioButton" {
        // AXValue for checkboxes is 0 or 1
        get_ax_string(element, "AXValue").and_then(|v| match v.as_str() {
            "1" => Some(true),
            "0" => Some(false),
            _ => None,
        })
    } else {
        None
    };

    ElementState {
        focused,
        enabled,
        visible: !hidden,
        selected,
        expanded,
        checked,
    }
}

/// Get available actions for an element.
fn get_ax_actions(element: AXUIElementRef) -> Vec<String> {
    let mut names_ref: CFTypeRef = ptr::null();
    let err = unsafe { AXUIElementCopyActionNames(element, &mut names_ref) };
    if err != K_AX_ERROR_SUCCESS || names_ref.is_null() {
        return vec![];
    }

    let arr: CFArray<CFType> = unsafe {
        CFArray::wrap_under_create_rule(names_ref as core_foundation::array::CFArrayRef)
    };

    let mut actions = Vec::new();
    for i in 0..arr.len() {
        if let Some(item) = arr.get(i) {
            let cf_ref = item.as_CFTypeRef();
            if unsafe { core_foundation::string::CFStringGetTypeID() }
                == unsafe { core_foundation::base::CFGetTypeID(cf_ref) }
            {
                let s: CFString = unsafe { CFString::wrap_under_get_rule(cf_ref as CFStringRef) };
                let action = s.to_string();
                // Map AX action names to our convention
                let mapped = match action.as_str() {
                    "AXPress" => "click",
                    "AXConfirm" => "activate",
                    "AXIncrement" => "increment",
                    "AXDecrement" => "decrement",
                    "AXCancel" => "cancel",
                    "AXShowMenu" => "show_menu",
                    _ => continue,
                };
                actions.push(mapped.to_string());
            }
        }
    }
    actions
}

/// Map AX role string to ElementRole.
fn map_role(role: &str, subrole: Option<&str>) -> ElementRole {
    match role {
        "AXButton" => ElementRole::Button,
        "AXTextField" | "AXTextArea" | "AXSearchField" | "AXSecureTextField" => ElementRole::Input,
        "AXStaticText" => ElementRole::Text,
        "AXWindow" => ElementRole::Window,
        "AXList" | "AXTable" => {
            if role == "AXTable" {
                ElementRole::Table
            } else {
                ElementRole::List
            }
        }
        "AXRow" => ElementRole::ListItem,
        "AXCell" => ElementRole::TableCell,
        "AXMenu" | "AXMenuBar" | "AXMenuBarItem" => ElementRole::Menu,
        "AXMenuItem" => ElementRole::MenuItem,
        "AXCheckBox" => ElementRole::Checkbox,
        "AXRadioButton" => ElementRole::RadioButton,
        "AXComboBox" | "AXPopUpButton" => ElementRole::ComboBox,
        "AXSlider" => ElementRole::Slider,
        "AXScrollBar" | "AXScrollArea" => ElementRole::ScrollBar,
        "AXTabGroup" => ElementRole::Tab,
        "AXRadioGroup" => ElementRole::Group,
        "AXOutline" => ElementRole::TreeView,
        "AXToolbar" => ElementRole::Toolbar,
        "AXGroup" => {
            // Check subrole for more specific types
            match subrole {
                Some("AXTabPanel") => ElementRole::TabItem,
                Some("AXContentList") => ElementRole::List,
                _ => ElementRole::Group,
            }
        }
        "AXImage" => ElementRole::Image,
        "AXLink" => ElementRole::Link,
        "AXSheet" | "AXDialog" => ElementRole::Dialog,
        "AXStatusBar" | "AXValueIndicator" => ElementRole::StatusBar,
        "AXWebArea" | "AXLayoutArea" => ElementRole::Group,
        _ => ElementRole::Custom(role.to_string()),
    }
}

/// Recursively find elements matching criteria.
fn find_in_tree(
    element: &AccessibilityElement,
    role: Option<&ElementRole>,
    label: Option<&str>,
    results: &mut Vec<AccessibilityElement>,
) {
    let role_match = role.map_or(true, |r| std::mem::discriminant(&element.role) == std::mem::discriminant(r));
    let label_match = label.map_or(true, |l| {
        element.label.as_deref().map_or(false, |el| el.to_lowercase().contains(&l.to_lowercase()))
    });

    if role_match && label_match {
        results.push(element.clone());
    }

    for child in &element.children {
        find_in_tree(child, role, label, results);
    }
}

// --- AXValue FFI for CGPoint/CGSize extraction ---

type AXValueRef = *const c_void;
const AX_VALUE_TYPE_CG_POINT: i32 = 1;
const AX_VALUE_TYPE_CG_SIZE: i32 = 2;

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXValueGetValue(value: AXValueRef, value_type: i32, out: *mut c_void) -> bool;
}

// --- Tests ---

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_role_basic() {
        assert!(matches!(map_role("AXButton", None), ElementRole::Button));
        assert!(matches!(map_role("AXTextField", None), ElementRole::Input));
        assert!(matches!(map_role("AXTextArea", None), ElementRole::Input));
        assert!(matches!(map_role("AXStaticText", None), ElementRole::Text));
        assert!(matches!(map_role("AXWindow", None), ElementRole::Window));
        assert!(matches!(map_role("AXCheckBox", None), ElementRole::Checkbox));
        assert!(matches!(map_role("AXRadioButton", None), ElementRole::RadioButton));
        assert!(matches!(map_role("AXSlider", None), ElementRole::Slider));
        assert!(matches!(map_role("AXLink", None), ElementRole::Link));
        assert!(matches!(map_role("AXImage", None), ElementRole::Image));
        assert!(matches!(map_role("AXDialog", None), ElementRole::Dialog));
        assert!(matches!(map_role("AXSheet", None), ElementRole::Dialog));
        assert!(matches!(map_role("AXToolbar", None), ElementRole::Toolbar));
        assert!(matches!(map_role("AXOutline", None), ElementRole::TreeView));
    }

    #[test]
    fn test_map_role_with_subrole() {
        assert!(matches!(map_role("AXGroup", Some("AXTabPanel")), ElementRole::TabItem));
        assert!(matches!(map_role("AXGroup", Some("AXContentList")), ElementRole::List));
        assert!(matches!(map_role("AXGroup", None), ElementRole::Group));
    }

    #[test]
    fn test_map_role_unknown() {
        match map_role("AXSomethingNew", None) {
            ElementRole::Custom(s) => assert_eq!(s, "AXSomethingNew"),
            _ => panic!("Expected Custom variant"),
        }
    }

    #[test]
    fn test_find_in_tree() {
        let tree = AccessibilityElement {
            id: "root".into(),
            role: ElementRole::Window,
            label: Some("Test Window".into()),
            description: None,
            value: None,
            bounds: None,
            state: ElementState::default_visible(),
            parent_id: None,
            actions: vec![],
            children: vec![
                AccessibilityElement {
                    id: "btn1".into(),
                    role: ElementRole::Button,
                    label: Some("OK".into()),
                    description: None,
                    value: None,
                    bounds: None,
                    state: ElementState::default_visible(),
                    parent_id: Some("root".into()),
                    actions: vec![],
                    children: vec![],
                },
                AccessibilityElement {
                    id: "btn2".into(),
                    role: ElementRole::Button,
                    label: Some("Cancel".into()),
                    description: None,
                    value: None,
                    bounds: None,
                    state: ElementState::default_visible(),
                    parent_id: Some("root".into()),
                    actions: vec![],
                    children: vec![],
                },
            ],
        };

        let mut results = Vec::new();
        find_in_tree(&tree, Some(&ElementRole::Button), None, &mut results);
        assert_eq!(results.len(), 2);

        let mut results = Vec::new();
        find_in_tree(&tree, None, Some("OK"), &mut results);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "btn1");
    }

    #[test]
    #[ignore] // Requires Accessibility permission — run manually
    fn live_macos_accessibility() {
        let mac = MacAccessibility::new().expect("Accessibility permission required");
        let tree = mac.get_tree().expect("Failed to get tree");
        assert!(!tree.id.is_empty());
        // Should have some children from the focused window
        println!("Root: {:?} - children: {}", tree.label, tree.children.len());
        for child in &tree.children {
            println!(
                "  {:?} {:?} {:?}",
                child.role, child.label, child.bounds
            );
        }
    }
}
