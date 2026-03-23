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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frame_creation() {
        let frame = Frame {
            data: vec![255, 0, 0, 255],
            width: 1,
            height: 1,
            timestamp_ms: 1234567890,
        };
        assert_eq!(frame.width, 1);
        assert_eq!(frame.height, 1);
        assert_eq!(frame.data.len(), 4);
        assert_eq!(frame.timestamp_ms, 1234567890);
    }

    #[test]
    fn test_frame_serialization_roundtrip() {
        let frame = Frame {
            data: vec![0, 0, 0, 255, 255, 255, 255, 255],
            width: 2,
            height: 1,
            timestamp_ms: 100,
        };
        let json = serde_json::to_string(&frame).unwrap();
        let back: Frame = serde_json::from_str(&json).unwrap();
        assert_eq!(back.width, 2);
        assert_eq!(back.height, 1);
        assert_eq!(back.data, frame.data);
    }

    #[test]
    fn test_encode_png_valid_2x2() {
        let frame = Frame {
            data: vec![
                255, 0, 0, 255,
                0, 255, 0, 255,
                0, 0, 255, 255,
                255, 255, 0, 255,
            ],
            width: 2,
            height: 2,
            timestamp_ms: 0,
        };
        let png = encode_png(&frame).unwrap();
        assert!(png.len() > 8);
        assert_eq!(&png[1..4], b"PNG");
    }

    #[test]
    fn test_encode_png_invalid_dimensions() {
        let frame = Frame {
            data: vec![0, 0, 0, 255],
            width: 10,
            height: 10,
            timestamp_ms: 0,
        };
        assert!(encode_png(&frame).is_err());
    }

    #[test]
    fn test_encode_png_single_pixel() {
        let frame = Frame {
            data: vec![128, 64, 32, 255],
            width: 1,
            height: 1,
            timestamp_ms: 42,
        };
        let png = encode_png(&frame).unwrap();
        assert!(!png.is_empty());
    }

    #[test]
    fn test_monitor_info_serialization() {
        let info = MonitorInfo {
            id: 1,
            name: "Primary".into(),
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            is_primary: true,
        };
        let json = serde_json::to_string(&info).unwrap();
        let back: MonitorInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, 1);
        assert_eq!(back.name, "Primary");
        assert!(back.is_primary);
        assert_eq!(back.width, 1920);
        assert_eq!(back.height, 1080);
    }

    #[test]
    fn test_window_info_serialization() {
        let info = WindowInfo {
            id: 42,
            title: "My App - Document".into(),
            app_name: "MyApp".into(),
            x: 100,
            y: 50,
            width: 800,
            height: 600,
            is_minimized: false,
        };
        let json = serde_json::to_string(&info).unwrap();
        let back: WindowInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, 42);
        assert_eq!(back.title, "My App - Document");
        assert!(!back.is_minimized);
    }

    #[test]
    fn test_capture_error_display() {
        assert_eq!(
            CaptureError::Unavailable.to_string(),
            "Screen capture not available on this platform"
        );
        assert_eq!(
            CaptureError::MonitorNotFound(5).to_string(),
            "Monitor not found: 5"
        );
        assert_eq!(
            CaptureError::WindowNotFound(99).to_string(),
            "Window not found: 99"
        );
        assert_eq!(
            CaptureError::NotInitialized.to_string(),
            "Capture not initialized"
        );
        assert_eq!(
            CaptureError::NoMonitors.to_string(),
            "No monitors found"
        );
        assert_eq!(
            CaptureError::EncodingError("bad".into()).to_string(),
            "Image encoding error: bad"
        );
        assert_eq!(
            CaptureError::CaptureFailed("oops".into()).to_string(),
            "Failed to capture frame: oops"
        );
    }

    #[test]
    fn test_create_capture_returns_instance() {
        let capture = create_capture();
        let _res = capture.resolution();
    }

    #[test]
    fn test_latest_frame_type() {
        let latest: LatestFrame = std::sync::Arc::new(std::sync::RwLock::new(None));
        assert!(latest.read().unwrap().is_none());

        let frame = Frame {
            data: vec![0; 4],
            width: 1,
            height: 1,
            timestamp_ms: 0,
        };
        *latest.write().unwrap() = Some(frame);
        assert!(latest.read().unwrap().is_some());
    }
}
