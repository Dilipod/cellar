use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum AccessibilityError {
    #[error("Accessibility API not available on this platform")]
    Unavailable,
    #[error("Failed to query accessibility tree: {0}")]
    QueryFailed(String),
    #[error("Element not found: {0}")]
    NotFound(String),
}

/// Bounding rectangle in screen coordinates.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// UI element role.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ElementRole {
    Window,
    Button,
    Input,
    Text,
    List,
    ListItem,
    Menu,
    MenuItem,
    Tab,
    TabItem,
    Table,
    TableRow,
    TableCell,
    Checkbox,
    RadioButton,
    ComboBox,
    Slider,
    ScrollBar,
    TreeView,
    TreeItem,
    Toolbar,
    StatusBar,
    Dialog,
    Group,
    Image,
    Link,
    Custom(String),
}

/// UI element state flags.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementState {
    pub focused: bool,
    pub enabled: bool,
    pub visible: bool,
    pub selected: bool,
    pub expanded: Option<bool>,
    pub checked: Option<bool>,
}

/// A single element in the accessibility tree.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessibilityElement {
    /// Unique identifier within this tree snapshot.
    pub id: String,
    /// Element role (button, input, etc.).
    pub role: ElementRole,
    /// Human-readable label.
    pub label: Option<String>,
    /// Current value (for inputs, sliders, etc.).
    pub value: Option<String>,
    /// Screen-space bounding rectangle.
    pub bounds: Option<Bounds>,
    /// Current state flags.
    pub state: ElementState,
    /// Child elements.
    pub children: Vec<AccessibilityElement>,
}

/// Platform-agnostic accessibility tree provider.
pub trait AccessibilityTree: Send + Sync {
    /// Get the full accessibility tree for the focused window.
    fn get_tree(&self) -> Result<AccessibilityElement, AccessibilityError>;

    /// Find elements matching a query (by role, label, value).
    fn find_elements(
        &self,
        role: Option<&ElementRole>,
        label: Option<&str>,
    ) -> Result<Vec<AccessibilityElement>, AccessibilityError>;

    /// Get the currently focused element.
    fn focused_element(&self) -> Result<Option<AccessibilityElement>, AccessibilityError>;
}

/// Stub implementation for unsupported platforms.
pub struct StubAccessibility;

impl AccessibilityTree for StubAccessibility {
    fn get_tree(&self) -> Result<AccessibilityElement, AccessibilityError> {
        tracing::warn!("Stub accessibility: returning empty tree");
        Ok(AccessibilityElement {
            id: "root".into(),
            role: ElementRole::Window,
            label: Some("Stub Window".into()),
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
            children: vec![],
        })
    }

    fn find_elements(
        &self,
        _role: Option<&ElementRole>,
        _label: Option<&str>,
    ) -> Result<Vec<AccessibilityElement>, AccessibilityError> {
        Ok(vec![])
    }

    fn focused_element(&self) -> Result<Option<AccessibilityElement>, AccessibilityError> {
        Ok(None)
    }
}
