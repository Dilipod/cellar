use crate::capture::{CaptureError, Frame, ScreenCapture};

/// Windows screen capture using DXGI Desktop Duplication API.
pub struct WindowsCapture {
    initialized: bool,
}

impl WindowsCapture {
    pub fn new() -> Self {
        Self { initialized: false }
    }
}

impl ScreenCapture for WindowsCapture {
    fn init(&mut self) -> Result<(), CaptureError> {
        // TODO: Initialize DXGI output duplication
        // 1. Create D3D11 device
        // 2. Get DXGI output
        // 3. Create output duplication
        tracing::info!("Initializing Windows DXGI screen capture");
        self.initialized = true;
        Ok(())
    }

    fn capture_frame(&mut self) -> Result<Frame, CaptureError> {
        if !self.initialized {
            return Err(CaptureError::NotInitialized);
        }
        // TODO: AcquireNextFrame → copy to CPU-readable texture → read pixels
        Err(CaptureError::CaptureFailed(
            "DXGI capture not yet implemented".into(),
        ))
    }

    fn resolution(&self) -> (u32, u32) {
        // TODO: Query actual display resolution
        (1920, 1080)
    }
}
