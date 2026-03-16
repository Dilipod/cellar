//! Linux accessibility via AT-SPI2 over D-Bus using zbus.
//!
//! Uses zbus blocking API to query the accessibility tree via the
//! org.a11y.atspi.Accessible interface. Falls back to StubAccessibility
//! if the AT-SPI2 registry is not running.

use crate::tree::{
    AccessibilityElement, AccessibilityError, AccessibilityTree, Bounds, ElementRole, ElementState,
};
use zbus::blocking::Connection;
use zbus::zvariant::OwnedValue;

/// Linux accessibility provider using AT-SPI2 D-Bus interface via zbus.
pub struct LinuxAccessibility {
    conn: Connection,
}

impl LinuxAccessibility {
    /// Create a new Linux accessibility provider.
    /// Checks if AT-SPI2 registry is running on the session bus.
    pub fn new() -> Result<Self, AccessibilityError> {
        let conn = Connection::session()
            .map_err(|e| AccessibilityError::QueryFailed(format!("D-Bus session: {}", e)))?;

        // Verify AT-SPI2 registry is reachable
        let proxy = zbus::blocking::fdo::DBusProxy::new(&conn)
            .map_err(|e| AccessibilityError::QueryFailed(format!("D-Bus proxy: {}", e)))?;
        let names = proxy
            .list_names()
            .map_err(|e| AccessibilityError::QueryFailed(format!("List names: {}", e)))?;

        let has_atspi = names
            .iter()
            .any(|n| n.as_str() == "org.a11y.atspi.Registry");
        if !has_atspi {
            return Err(AccessibilityError::Unavailable);
        }

        Ok(Self { conn })
    }

    /// Query the Name property of an accessible object.
    fn get_name(&self, dest: &str, path: &str) -> Option<String> {
        let proxy = zbus::blocking::Proxy::new(
            &self.conn,
            dest,
            path,
            "org.a11y.atspi.Accessible",
        )
        .ok()?;
        let value: OwnedValue = proxy.get_property("Name").ok()?;
        let name: &str = value.downcast_ref().ok()?;
        if name.is_empty() {
            None
        } else {
            Some(name.to_string())
        }
    }

    /// Get children of an accessible object as (bus_name, object_path) pairs.
    fn get_children(&self, dest: &str, path: &str) -> Vec<(String, String)> {
        let proxy = match zbus::blocking::Proxy::new(
            &self.conn,
            dest,
            path,
            "org.a11y.atspi.Accessible",
        ) {
            Ok(p) => p,
            Err(_) => return vec![],
        };

        // GetChildren returns array of (bus_name, object_path) structs
        let result: Result<Vec<(String, String)>, _> = proxy.call("GetChildren", &());
        result.unwrap_or_default()
    }
}

impl AccessibilityTree for LinuxAccessibility {
    fn get_tree(&self) -> Result<AccessibilityElement, AccessibilityError> {
        let children_refs =
            self.get_children("org.a11y.atspi.Registry", "/org/a11y/atspi/accessible/root");

        let mut children = Vec::new();
        for (idx, (bus_name, _obj_path)) in children_refs.iter().enumerate() {
            let app_name = self
                .get_name(bus_name, "/org/a11y/atspi/accessible/root")
                .unwrap_or_else(|| format!("app-{}", idx));

            children.push(AccessibilityElement {
                id: format!("app-{}", idx),
                role: ElementRole::Window,
                label: Some(app_name),
                value: None,
                bounds: None,
                state: ElementState {
                    focused: idx == 0,
                    enabled: true,
                    visible: true,
                    selected: false,
                    expanded: None,
                    checked: None,
                },
                children: vec![],
            });
        }

        Ok(make_root_element(children))
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
        let name = self.get_name(
            "org.a11y.atspi.Registry",
            "/org/a11y/atspi/accessible/root",
        );

        match name {
            Some(n) if !n.is_empty() => Ok(Some(AccessibilityElement {
                id: "focused".into(),
                role: ElementRole::Window,
                label: Some(n),
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
            })),
            _ => Ok(None),
        }
    }
}

/// Build the root element with children.
fn make_root_element(children: Vec<AccessibilityElement>) -> AccessibilityElement {
    AccessibilityElement {
        id: "root".into(),
        role: ElementRole::Window,
        label: Some("Desktop".into()),
        value: None,
        bounds: Some(Bounds {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        }),
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
                focused: true,
                enabled: true,
                visible: true,
                selected: false,
                expanded: None,
                checked: None,
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
                focused: true,
                enabled: true,
                visible: true,
                selected: false,
                expanded: None,
                checked: None,
            },
            children: vec![
                AccessibilityElement {
                    id: "btn-1".into(),
                    role: ElementRole::Button,
                    label: Some("OK".into()),
                    value: None,
                    bounds: None,
                    state: ElementState {
                        focused: false,
                        enabled: true,
                        visible: true,
                        selected: false,
                        expanded: None,
                        checked: None,
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
                        focused: false,
                        enabled: true,
                        visible: true,
                        selected: false,
                        expanded: None,
                        checked: None,
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
        let tree = make_root_element(vec![AccessibilityElement {
            id: "btn-1".into(),
            role: ElementRole::Button,
            label: Some("Submit Form".into()),
            value: None,
            bounds: None,
            state: ElementState {
                focused: false,
                enabled: true,
                visible: true,
                selected: false,
                expanded: None,
                checked: None,
            },
            children: vec![],
        }]);

        let mut results = Vec::new();
        collect_matching(&tree, None, Some("Submit"), &mut results);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "btn-1");
    }
}
