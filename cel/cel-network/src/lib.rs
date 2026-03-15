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
