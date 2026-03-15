use crate::inject::{InputController, InputError, MouseButton};

/// Windows input controller using SendInput / Win32.
pub struct WindowsInput;

impl WindowsInput {
    pub fn new() -> Self {
        Self
    }
}

impl InputController for WindowsInput {
    fn mouse_move(&self, _x: i32, _y: i32) -> Result<(), InputError> {
        // TODO: SetCursorPos or SendInput with MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE
        Err(InputError::Failed("Not yet implemented".into()))
    }

    fn click(&self, _x: i32, _y: i32, _button: MouseButton) -> Result<(), InputError> {
        // TODO: SendInput with MOUSEEVENTF_LEFTDOWN + MOUSEEVENTF_LEFTUP
        Err(InputError::Failed("Not yet implemented".into()))
    }

    fn double_click(&self, _x: i32, _y: i32, _button: MouseButton) -> Result<(), InputError> {
        Err(InputError::Failed("Not yet implemented".into()))
    }

    fn type_text(&self, _text: &str) -> Result<(), InputError> {
        // TODO: SendInput with KEYEVENTF_UNICODE for each character
        Err(InputError::Failed("Not yet implemented".into()))
    }

    fn key_press(&self, _key: &str) -> Result<(), InputError> {
        // TODO: Map key name to virtual key code, SendInput
        Err(InputError::Failed("Not yet implemented".into()))
    }

    fn key_combo(&self, _keys: &[&str]) -> Result<(), InputError> {
        Err(InputError::Failed("Not yet implemented".into()))
    }

    fn scroll(&self, _dx: i32, _dy: i32) -> Result<(), InputError> {
        Err(InputError::Failed("Not yet implemented".into()))
    }
}
