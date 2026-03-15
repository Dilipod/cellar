//! CEL Input Layer
//!
//! Input injection and interception for mouse and keyboard events.
//! Supports Windows (SendInput / Win32 hooks) and macOS (CGEvent / event taps).

mod inject;

#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "macos")]
mod macos;

pub use inject::{InputController, InputEvent, InputError, MouseButton};

/// Create a platform-appropriate input controller.
pub fn create_controller() -> Box<dyn InputController> {
    #[cfg(target_os = "windows")]
    {
        Box::new(windows::WindowsInput::new())
    }
    #[cfg(target_os = "macos")]
    {
        Box::new(macos::MacInput::new())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Box::new(inject::StubInput)
    }
}
