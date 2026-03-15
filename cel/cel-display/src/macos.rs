use crate::capture::{CaptureError, Frame, ScreenCapture};

/// macOS screen capture using ScreenCaptureKit / CGWindowListCreateImage.
pub struct MacCapture {
    initialized: bool,
}

impl MacCapture {
    pub fn new() -> Self {
        Self { initialized: false }
    }
}

impl ScreenCapture for MacCapture {
    fn init(&mut self) -> Result<(), CaptureError> {
        // TODO: Initialize ScreenCaptureKit (macOS 12.3+)
        // Fallback to CGWindowListCreateImage for older versions
        tracing::info!("Initializing macOS screen capture");
        self.initialized = true;
        Ok(())
    }

    fn capture_frame(&mut self) -> Result<Frame, CaptureError> {
        if !self.initialized {
            return Err(CaptureError::NotInitialized);
        }
        // TODO: SCStreamOutput or CGWindowListCreateImage → raw RGBA
        Err(CaptureError::CaptureFailed(
            "macOS capture not yet implemented".into(),
        ))
    }

    fn resolution(&self) -> (u32, u32) {
        // TODO: Query actual display resolution via CGDisplayPixelsWide/High
        (1920, 1080)
    }
}
