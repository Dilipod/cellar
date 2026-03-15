use serde::{Deserialize, Serialize};
use std::sync::{Arc, RwLock};

/// A captured screen frame.
#[derive(Clone, Serialize, Deserialize)]
pub struct Frame {
    /// Raw RGBA pixel data.
    pub data: Vec<u8>,
    /// Frame width in pixels.
    pub width: u32,
    /// Frame height in pixels.
    pub height: u32,
    /// Capture timestamp (milliseconds since epoch).
    pub timestamp_ms: u64,
}

/// Information about a display monitor.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorInfo {
    pub id: u32,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

/// Information about a window.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowInfo {
    pub id: u32,
    pub title: String,
    pub app_name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_minimized: bool,
}

/// Error type for screen capture operations.
#[derive(Debug, thiserror::Error)]
pub enum CaptureError {
    #[error("Screen capture not available on this platform")]
    Unavailable,
    #[error("Failed to capture frame: {0}")]
    CaptureFailed(String),
    #[error("Capture not initialized")]
    NotInitialized,
    #[error("No monitors found")]
    NoMonitors,
    #[error("Monitor not found: {0}")]
    MonitorNotFound(u32),
    #[error("Window not found: {0}")]
    WindowNotFound(u32),
    #[error("Image encoding error: {0}")]
    EncodingError(String),
}

/// Platform-agnostic screen capture trait.
pub trait ScreenCapture: Send + Sync {
    /// Initialize the capture session.
    fn init(&mut self) -> Result<(), CaptureError>;

    /// Capture the primary monitor.
    fn capture_frame(&mut self) -> Result<Frame, CaptureError>;

    /// Capture a specific monitor by ID.
    fn capture_monitor(&mut self, monitor_id: u32) -> Result<Frame, CaptureError>;

    /// Capture a specific window by ID.
    fn capture_window(&mut self, window_id: u32) -> Result<Frame, CaptureError>;

    /// List available monitors.
    fn list_monitors(&self) -> Result<Vec<MonitorInfo>, CaptureError>;

    /// List visible windows.
    fn list_windows(&self) -> Result<Vec<WindowInfo>, CaptureError>;

    /// Get the primary display resolution.
    fn resolution(&self) -> (u32, u32);
}

/// Thread-safe latest frame holder for continuous capture.
pub type LatestFrame = Arc<RwLock<Option<Frame>>>;

/// Encode a frame as PNG bytes.
pub fn encode_png(frame: &Frame) -> Result<Vec<u8>, CaptureError> {
    use image::{ImageBuffer, RgbaImage};
    let img: RgbaImage = ImageBuffer::from_raw(frame.width, frame.height, frame.data.clone())
        .ok_or_else(|| CaptureError::EncodingError("Invalid frame dimensions".into()))?;
    let mut buf = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new(&mut buf);
    image::ImageEncoder::write_image(
        encoder,
        &img,
        frame.width,
        frame.height,
        image::ExtendedColorType::Rgba8,
    )
    .map_err(|e| CaptureError::EncodingError(e.to_string()))?;
    Ok(buf)
}
