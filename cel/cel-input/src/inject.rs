use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum InputError {
    #[error("Input injection not available on this platform")]
    Unavailable,
    #[error("Input injection failed: {0}")]
    Failed(String),
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
}

/// Platform-agnostic input controller trait.
pub trait InputController: Send + Sync {
    /// Move the mouse to absolute screen coordinates.
    fn mouse_move(&self, x: i32, y: i32) -> Result<(), InputError>;

    /// Click at absolute screen coordinates.
    fn click(&self, x: i32, y: i32, button: MouseButton) -> Result<(), InputError>;

    /// Double-click at absolute screen coordinates.
    fn double_click(&self, x: i32, y: i32, button: MouseButton) -> Result<(), InputError>;

    /// Type a string of text.
    fn type_text(&self, text: &str) -> Result<(), InputError>;

    /// Press a single key (e.g., "Enter", "Tab", "Escape").
    fn key_press(&self, key: &str) -> Result<(), InputError>;

    /// Press a key combination (e.g., ["Ctrl", "C"]).
    fn key_combo(&self, keys: &[&str]) -> Result<(), InputError>;

    /// Scroll at the current mouse position.
    fn scroll(&self, dx: i32, dy: i32) -> Result<(), InputError>;
}

/// Stub input controller for unsupported platforms.
pub struct StubInput;

impl InputController for StubInput {
    fn mouse_move(&self, _x: i32, _y: i32) -> Result<(), InputError> {
        tracing::warn!("Stub input: mouse_move");
        Ok(())
    }
    fn click(&self, _x: i32, _y: i32, _button: MouseButton) -> Result<(), InputError> {
        tracing::warn!("Stub input: click");
        Ok(())
    }
    fn double_click(&self, _x: i32, _y: i32, _button: MouseButton) -> Result<(), InputError> {
        tracing::warn!("Stub input: double_click");
        Ok(())
    }
    fn type_text(&self, _text: &str) -> Result<(), InputError> {
        tracing::warn!("Stub input: type_text");
        Ok(())
    }
    fn key_press(&self, _key: &str) -> Result<(), InputError> {
        tracing::warn!("Stub input: key_press");
        Ok(())
    }
    fn key_combo(&self, _keys: &[&str]) -> Result<(), InputError> {
        tracing::warn!("Stub input: key_combo");
        Ok(())
    }
    fn scroll(&self, _dx: i32, _dy: i32) -> Result<(), InputError> {
        tracing::warn!("Stub input: scroll");
        Ok(())
    }
}
