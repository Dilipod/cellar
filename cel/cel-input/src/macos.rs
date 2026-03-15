use crate::inject::{InputController, InputError, MouseButton};

/// macOS input controller using CGEvent.
pub struct MacInput;

impl MacInput {
    pub fn new() -> Self {
        Self
    }
}

impl InputController for MacInput {
    fn mouse_move(&self, _x: i32, _y: i32) -> Result<(), InputError> {
        // TODO: CGEventCreateMouseEvent + CGEventPost
        Err(InputError::Failed("Not yet implemented".into()))
    }

    fn click(&self, _x: i32, _y: i32, _button: MouseButton) -> Result<(), InputError> {
        // TODO: CGEventCreateMouseEvent for down + up
        Err(InputError::Failed("Not yet implemented".into()))
    }

    fn double_click(&self, _x: i32, _y: i32, _button: MouseButton) -> Result<(), InputError> {
        Err(InputError::Failed("Not yet implemented".into()))
    }

    fn type_text(&self, _text: &str) -> Result<(), InputError> {
        // TODO: CGEventKeyboardSetUnicodeString + CGEventPost
        Err(InputError::Failed("Not yet implemented".into()))
    }

    fn key_press(&self, _key: &str) -> Result<(), InputError> {
        // TODO: Map key name to CGKeyCode, CGEventCreateKeyboardEvent
        Err(InputError::Failed("Not yet implemented".into()))
    }

    fn key_combo(&self, _keys: &[&str]) -> Result<(), InputError> {
        Err(InputError::Failed("Not yet implemented".into()))
    }

    fn scroll(&self, _dx: i32, _dy: i32) -> Result<(), InputError> {
        // TODO: CGEventCreateScrollWheelEvent
        Err(InputError::Failed("Not yet implemented".into()))
    }
}
