//! CEL Input Layer
//!
//! Input injection and interception for mouse and keyboard events.
//! Uses enigo for cross-platform input simulation (Windows, macOS, Linux).

mod inject;
mod enigo_input;

pub use inject::{InputController, InputError, InputEvent, MouseButton};
pub use enigo_input::EnigoInput;

/// Create a platform-appropriate input controller.
pub fn create_controller() -> Result<Box<dyn InputController>, InputError> {
    Ok(Box::new(EnigoInput::new()?))
}
