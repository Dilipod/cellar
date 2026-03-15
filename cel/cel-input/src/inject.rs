use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum InputError {
    #[error("Input injection not available on this platform")]
    Unavailable,
    #[error("Input injection failed: {0}")]
    Failed(String),
    #[error("Invalid key: {0}")]
    InvalidKey(String),
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

/// A recorded input event for logging and replay.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum InputEvent {
    MouseMove { x: i32, y: i32 },
    MouseClick { x: i32, y: i32, button: MouseButton },
    MouseDown { x: i32, y: i32, button: MouseButton },
    MouseUp { x: i32, y: i32, button: MouseButton },
    KeyPress { key: String },
    KeyDown { key: String },
    KeyUp { key: String },
    TypeText { text: String },
    Scroll { dx: i32, dy: i32 },
}

/// Platform-agnostic input controller trait.
pub trait InputController: Send + Sync {
    /// Move the mouse to absolute screen coordinates.
    fn mouse_move(&mut self, x: i32, y: i32) -> Result<(), InputError>;

    /// Click at absolute screen coordinates.
    fn click(&mut self, x: i32, y: i32, button: MouseButton) -> Result<(), InputError>;

    /// Double-click at absolute screen coordinates.
    fn double_click(&mut self, x: i32, y: i32, button: MouseButton) -> Result<(), InputError>;

    /// Type a string of text (uses fast unicode input).
    fn type_text(&mut self, text: &str) -> Result<(), InputError>;

    /// Press and release a single key (e.g., "Enter", "Tab", "Escape").
    fn key_press(&mut self, key: &str) -> Result<(), InputError>;

    /// Press a key combination (e.g., ["Ctrl", "C"]).
    fn key_combo(&mut self, keys: &[&str]) -> Result<(), InputError>;

    /// Scroll at the current mouse position.
    fn scroll(&mut self, dx: i32, dy: i32) -> Result<(), InputError>;

    /// Get the main display size.
    fn display_size(&self) -> Result<(i32, i32), InputError>;
}
