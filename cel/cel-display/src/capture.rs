use serde::{Deserialize, Serialize};

/// A captured screen frame.
#[derive(Clone, Serialize, Deserialize)]
pub struct Frame {
    /// Raw RGBA pixel data.
    pub data: Vec<u8>,
    /// Frame width in pixels.
    pub width: u32,
    /// Frame height in pixels.
    pub height: u32,
    /// Capture timestamp (milliseconds since capture session start).
    pub timestamp_ms: u64,
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
}

/// Platform-agnostic screen capture trait.
pub trait ScreenCapture: Send + Sync {
    /// Initialize the capture session.
    fn init(&mut self) -> Result<(), CaptureError>;

    /// Capture a single frame.
    fn capture_frame(&mut self) -> Result<Frame, CaptureError>;

    /// Get the current display resolution.
    fn resolution(&self) -> (u32, u32);
}

/// Stub capture for unsupported platforms (Linux dev/CI).
pub struct StubCapture;

impl ScreenCapture for StubCapture {
    fn init(&mut self) -> Result<(), CaptureError> {
        tracing::warn!("Using stub screen capture — no real capture available on this platform");
        Ok(())
    }

    fn capture_frame(&mut self) -> Result<Frame, CaptureError> {
        Ok(Frame {
            data: vec![0u8; 1920 * 1080 * 4],
            width: 1920,
            height: 1080,
            timestamp_ms: 0,
        })
    }

    fn resolution(&self) -> (u32, u32) {
        (1920, 1080)
    }
}
