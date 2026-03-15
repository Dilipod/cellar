//! CEL Network Layer
//!
//! Traffic monitoring and filtering. Useful for web-based apps and for
//! detecting app state changes via API calls.

use serde::{Deserialize, Serialize};

/// A captured network event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkEvent {
    /// Timestamp in milliseconds.
    pub timestamp_ms: u64,
    /// HTTP method (if applicable).
    pub method: Option<String>,
    /// Request URL.
    pub url: String,
    /// HTTP status code (if response captured).
    pub status: Option<u16>,
    /// Content type.
    pub content_type: Option<String>,
    /// Response body size in bytes.
    pub body_size: Option<u64>,
}

/// Network monitor trait.
pub trait NetworkMonitor: Send + Sync {
    /// Start monitoring network traffic.
    fn start(&mut self) -> Result<(), NetworkError>;

    /// Stop monitoring.
    fn stop(&mut self) -> Result<(), NetworkError>;

    /// Get captured events since last call (drains the buffer).
    fn drain_events(&mut self) -> Vec<NetworkEvent>;
}

#[derive(Debug, thiserror::Error)]
pub enum NetworkError {
    #[error("Network monitoring not available: {0}")]
    Unavailable(String),
    #[error("Monitor failed: {0}")]
    Failed(String),
}

/// Stub network monitor.
pub struct StubNetworkMonitor;

impl NetworkMonitor for StubNetworkMonitor {
    fn start(&mut self) -> Result<(), NetworkError> {
        tracing::warn!("Stub network monitor: no real monitoring");
        Ok(())
    }
    fn stop(&mut self) -> Result<(), NetworkError> {
        Ok(())
    }
    fn drain_events(&mut self) -> Vec<NetworkEvent> {
        vec![]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stub_monitor_start_stop() {
        let mut monitor = StubNetworkMonitor;
        assert!(monitor.start().is_ok());
        assert!(monitor.stop().is_ok());
    }

    #[test]
    fn test_stub_monitor_drain_empty() {
        let mut monitor = StubNetworkMonitor;
        monitor.start().unwrap();
        let events = monitor.drain_events();
        assert!(events.is_empty());
    }

    #[test]
    fn test_network_event_serialization() {
        let event = NetworkEvent {
            timestamp_ms: 1700000000000,
            method: Some("GET".into()),
            url: "https://api.example.com/data".into(),
            status: Some(200),
            content_type: Some("application/json".into()),
            body_size: Some(4096),
        };
        let json = serde_json::to_string(&event).unwrap();
        let back: NetworkEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(back.url, "https://api.example.com/data");
        assert_eq!(back.method.as_deref(), Some("GET"));
        assert_eq!(back.status, Some(200));
        assert_eq!(back.body_size, Some(4096));
    }

    #[test]
    fn test_network_event_minimal() {
        let event = NetworkEvent {
            timestamp_ms: 0,
            method: None,
            url: "ws://localhost:8080".into(),
            status: None,
            content_type: None,
            body_size: None,
        };
        let json = serde_json::to_string(&event).unwrap();
        let back: NetworkEvent = serde_json::from_str(&json).unwrap();
        assert!(back.method.is_none());
        assert!(back.status.is_none());
    }

    #[test]
    fn test_network_error_display() {
        assert_eq!(
            NetworkError::Unavailable("no pcap".into()).to_string(),
            "Network monitoring not available: no pcap"
        );
        assert_eq!(
            NetworkError::Failed("connection reset".into()).to_string(),
            "Monitor failed: connection reset"
        );
    }
}
