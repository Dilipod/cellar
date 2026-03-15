//! CEL Display Layer
//!
//! Screen capture and virtual framebuffer for the Context Execution Layer.
//! Uses xcap for cross-platform screen and window capture.

mod capture;
mod xcap_capture;

pub use capture::{
    encode_png, CaptureError, Frame, LatestFrame, MonitorInfo, ScreenCapture, WindowInfo,
};
pub use xcap_capture::XcapCapture;

/// Create a screen capture instance.
pub fn create_capture() -> Box<dyn ScreenCapture> {
    Box::new(XcapCapture::new())
}
