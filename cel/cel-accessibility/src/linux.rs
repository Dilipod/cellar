//! Linux accessibility via AT-SPI2 over D-Bus.
//!
//! Uses synchronous D-Bus calls to query the accessibility tree via the
//! org.a]1y.atspi.Accessible interface. Falls back to StubAccessibility
//! if the AT-SPI2 registry is not running.

use crate::tree::{
    AccessibilityElement, AccessibilityError, AccessibilityTree, Bounds, ElementRole, ElementState,
};
use std::process::Command;

/// Linux accessibility provider using AT-SPI2 D-Bus interface.
pub struct LinuxAccessibility {
    /// Whether AT-SPI2 daemon is reachable.
    available: bool,
}

impl LinuxAccessibility {
    /// Create a new Linux accessibility provider.
    /// Checks if AT-SPI2 registry is running on the session bus.
    pub fn new() -> Result<Self, AccessibilityError> {
        // Check if AT-SPI2 registry is accessible on the D-Bus session bus
        let available = check_atspi_available();
        if !available {
            return Err(AccessibilityError::Unavailable);
        }
        Ok(Self { available })
    }
}

impl AccessibilityTree for LinuxAccessibility {
    fn get_tree(&self) -> Result<AccessibilityElement, AccessibilityError> {
        if !self.available {
            return Err(AccessibilityError::Unavailable);
        }

        // Query AT-SPI2 via gdbus for the active application's accessibility tree
        let output = Command::new("gdbus")
            .args([
                "call",
                "--session",
                "--dest=org.a11y.atspi.Registry",
                "--object-path=/org/a11y/atspi/accessible/root",
                "--method=org.a11y.atspi.Accessible.GetChildren",
            ])
            .output();

        match output {
            Ok(out) if out.status.success() => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                parse_atspi_children(&stdout)
            }
            Ok(out) => {
                let stderr = String::from_utf8_lossy(&out.stderr);
                tracing::debug!("AT-SPI2 query returned error: {}", stderr);
                // Return a basic root even if the detailed tree fails
                Ok(make_root_element(vec![]))
            }
            Err(e) => {
                tracing::debug!("Failed to call gdbus: {}", e);
                Ok(make_root_element(vec![]))
            }
        }
    }

    fn find_elements(
        &self,
        role: Option<&ElementRole>,
        label: Option<&str>,
    ) -> Result<Vec<AccessibilityElement>, AccessibilityError> {
        let tree = self.get_tree()?;
        let mut results = Vec::new();
        collect_matching(&tree, role, label, &mut results);
        Ok(results)
    }

    fn focused_element(&self) -> Result<Option<AccessibilityElement>, AccessibilityError> {
        if !self.available {
            return Ok(None);
        }

        // Query the focused element via AT-SPI2
        let output = Command::new("gdbus")
            .args([
                "call",
                "--session",
                "--dest=org.a11y.atspi.Registry",
                "--object-path=/org/a11y/atspi/accessible/root",
                "--method=org.freedesktop.DBus.Properties.Get",
                "org.a11y.atspi.Accessible",
                "Name",
            ])
            .output();

        match output {
            Ok(out) if out.status.success() => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let name = extract_dbus_string(&stdout);
                if name.is_empty() {
                    Ok(None)
                } else {
                    Ok(Some(AccessibilityElement {
                        id: "focused".into(),
                        role: ElementRole::Window,
                        label: Some(name),
                        value: None,
                        bounds: None,
                        state: ElementState {
                            focused: true,
                            enabled: true,
                            visible: true,
                            selected: false,
                            expanded: None,
                            checked: None,
                        },
                        children: vec![],
                    }))
                }
            }
            _ => Ok(None),
        }
    }
}

/// Check if AT-SPI2 registry is reachable on the session bus.
fn check_atspi_available() -> bool {
    let output = Command::new("gdbus")
        .args([
            "introspect",
            "--session",
            "--dest=org.a11y.atspi.Registry",
            "--object-path=/org/a11y/atspi/accessible/root",
        ])
        .output();

    match output {
        Ok(out) => out.status.success(),
        Err(_) => false,
    }
}

/// Parse AT-SPI2 children response into accessibility elements.
fn parse_atspi_children(output: &str) -> Result<AccessibilityElement, AccessibilityError> {
    // gdbus output format: ([(':1.123', '/org/a11y/atspi/accessible/1'), ...],)
    // Parse app names from the bus connections
    let mut children = Vec::new();
    let mut idx = 0;

    // Extract bus-name/path pairs
    for segment in output.split("('") {
        if segment.contains("atspi") || segment.contains(':') {
            // Try to get the app name for this accessible
            let bus_name: String = segment
                .chars()
                .take_while(|c| *c != '\'')
                .collect();

            if bus_name.starts_with(':') {
                let app_name = query_app_name(&bus_name).unwrap_or_else(|| format!("app-{}", idx));
                children.push(AccessibilityElement {
                    id: format!("app-{}", idx),
                    role: ElementRole::Window,
                    label: Some(app_name),
                    value: None,
                    bounds: None,
                    state: ElementState {
                        focused: idx == 0, // First app is assumed focused
                        enabled: true,
                        visible: true,
                        selected: false,
                        expanded: None,
                        checked: None,
                    },
                    children: vec![],
                });
                idx += 1;
            }
        }
    }

    Ok(make_root_element(children))
}

/// Query the application name from its AT-SPI2 bus name.
fn query_app_name(bus_name: &str) -> Option<String> {
    let output = Command::new("gdbus")
        .args([
            "call",
            "--session",
            &format!("--dest={}", bus_name),
            "--object-path=/org/a11y/atspi/accessible/root",
            "--method=org.freedesktop.DBus.Properties.Get",
            "org.a11y.atspi.Accessible",
            "Name",
        ])
        .output()
        .ok()?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let name = extract_dbus_string(&stdout);
        if name.is_empty() { None } else { Some(name) }
    } else {
        None
    }
}

/// Extract a string from D-Bus variant format: (<'string value'>,)
fn extract_dbus_string(output: &str) -> String {
    // Format: (<'some string'>,) or (<<'some string'>>,)
    let trimmed = output.trim();
    if let Some(start) = trimmed.find('\'') {
        if let Some(end) = trimmed[start + 1..].find('\'') {
            return trimmed[start + 1..start + 1 + end].to_string();
        }
    }
    String::new()
}

/// Build the root element with children.
fn make_root_element(children: Vec<AccessibilityElement>) -> AccessibilityElement {
    AccessibilityElement {
        id: "root".into(),
        role: ElementRole::Window,
        label: Some("Desktop".into()),
        value: None,
        bounds: Some(Bounds { x: 0, y: 0, width: 1920, height: 1080 }),
        state: ElementState {
            focused: true,
            enabled: true,
            visible: true,
            selected: false,
            expanded: None,
            checked: None,
        },
        children,
    }
}

/// Recursively collect elements matching role and/or label.
fn collect_matching(
    node: &AccessibilityElement,
    role: Option<&ElementRole>,
    label: Option<&str>,
    out: &mut Vec<AccessibilityElement>,
) {
    let role_matches = role.map_or(true, |r| {
        std::mem::discriminant(&node.role) == std::mem::discriminant(r)
    });
    let label_matches = label.map_or(true, |l| {
        node.label.as_deref().map_or(false, |nl| nl.contains(l))
    });

    if role_matches && label_matches {
        out.push(node.clone());
    }

    for child in &node.children {
        collect_matching(child, role, label, out);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_dbus_string() {
        assert_eq!(extract_dbus_string("(<'Firefox'>,)"), "Firefox");
        assert_eq!(extract_dbus_string("(<'My App Name'>,)"), "My App Name");
        assert_eq!(extract_dbus_string("()"), "");
    }

    #[test]
    fn test_make_root_element() {
        let root = make_root_element(vec![]);
        assert_eq!(root.id, "root");
        assert!(root.children.is_empty());
    }

    #[test]
    fn test_make_root_with_children() {
        let child = AccessibilityElement {
            id: "app-0".into(),
            role: ElementRole::Window,
            label: Some("Firefox".into()),
            value: None,
            bounds: None,
            state: ElementState {
                focused: true, enabled: true, visible: true,
                selected: false, expanded: None, checked: None,
            },
            children: vec![],
        };
        let root = make_root_element(vec![child]);
        assert_eq!(root.children.len(), 1);
        assert_eq!(root.children[0].label.as_deref(), Some("Firefox"));
    }

    #[test]
    fn test_collect_matching_by_role() {
        let tree = AccessibilityElement {
            id: "root".into(),
            role: ElementRole::Window,
            label: Some("Root".into()),
            value: None,
            bounds: None,
            state: ElementState {
                focused: true, enabled: true, visible: true,
                selected: false, expanded: None, checked: None,
            },
            children: vec![
                AccessibilityElement {
                    id: "btn-1".into(),
                    role: ElementRole::Button,
                    label: Some("OK".into()),
                    value: None,
                    bounds: None,
                    state: ElementState {
                        focused: false, enabled: true, visible: true,
                        selected: false, expanded: None, checked: None,
                    },
                    children: vec![],
                },
                AccessibilityElement {
                    id: "txt-1".into(),
                    role: ElementRole::Text,
                    label: Some("Hello".into()),
                    value: None,
                    bounds: None,
                    state: ElementState {
                        focused: false, enabled: true, visible: true,
                        selected: false, expanded: None, checked: None,
                    },
                    children: vec![],
                },
            ],
        };

        let mut results = Vec::new();
        collect_matching(&tree, Some(&ElementRole::Button), None, &mut results);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "btn-1");
    }

    #[test]
    fn test_collect_matching_by_label() {
        let tree = make_root_element(vec![
            AccessibilityElement {
                id: "btn-1".into(),
                role: ElementRole::Button,
                label: Some("Submit Form".into()),
                value: None,
                bounds: None,
                state: ElementState {
                    focused: false, enabled: true, visible: true,
                    selected: false, expanded: None, checked: None,
                },
                children: vec![],
            },
        ]);

        let mut results = Vec::new();
        collect_matching(&tree, None, Some("Submit"), &mut results);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "btn-1");
    }
}
