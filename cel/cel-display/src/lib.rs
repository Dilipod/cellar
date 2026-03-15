//! CEL Display Layer
//!
//! Screen capture and virtual framebuffer for the Context Execution Layer.
//! Supports Windows (DXGI Desktop Duplication) and macOS (ScreenCaptureKit / CGImage).

mod capture;

#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "macos")]
mod macos;

pub use capture::{Frame, ScreenCapture};

/// Create a platform-appropriate screen capture instance.
pub fn create_capture() -> Box<dyn ScreenCapture> {
    #[cfg(target_os = "windows")]
    {
        Box::new(windows::WindowsCapture::new())
    }
    #[cfg(target_os = "macos")]
    {
        Box::new(macos::MacCapture::new())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Box::new(capture::StubCapture)
    }
}
