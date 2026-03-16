//! CEL Network Layer
//!
//! Traffic monitoring and filtering. Useful for web-based apps and for
//! detecting app state changes via API calls.
//!
//! Two monitoring approaches:
//! 1. **ProcNetMonitor** — reads /proc/net/tcp (Linux) for connection state
//! 2. **StubNetworkMonitor** — no-op fallback

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

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
    /// Source port.
    pub source_port: Option<u16>,
    /// Destination port.
    pub dest_port: Option<u16>,
    /// Connection state.
    pub state: Option<String>,
}

/// Network monitor trait.
pub trait NetworkMonitor: Send + Sync {
    /// Start monitoring network traffic.
    fn start(&mut self) -> Result<(), NetworkError>;

    /// Stop monitoring.
    fn stop(&mut self) -> Result<(), NetworkError>;

    /// Get captured events since last call (drains the buffer).
    fn drain_events(&mut self) -> Vec<NetworkEvent>;

    /// Whether the monitor is currently active.
    fn is_running(&self) -> bool;
}

#[derive(Debug, thiserror::Error)]
pub enum NetworkError {
    #[error("Network monitoring not available: {0}")]
    Unavailable(String),
    #[error("Monitor failed: {0}")]
    Failed(String),
}

/// Stub network monitor — no-op fallback.
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
    fn is_running(&self) -> bool {
        false
    }
}

/// Linux /proc/net/tcp monitor — polls connection state to detect new connections.
#[cfg(target_os = "linux")]
pub struct ProcNetMonitor {
    running: bool,
    events: Arc<Mutex<Vec<NetworkEvent>>>,
    known_connections: std::collections::HashSet<String>,
}

#[cfg(target_os = "linux")]
impl ProcNetMonitor {
    pub fn new() -> Self {
        Self {
            running: false,
            events: Arc::new(Mutex::new(Vec::new())),
            known_connections: std::collections::HashSet::new(),
        }
    }

    /// Poll /proc/net/tcp for active connections and detect new ones.
    pub fn poll(&mut self) {
        if !self.running {
            return;
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        // Read both tcp and tcp6
        for path in &["/proc/net/tcp", "/proc/net/tcp6"] {
            if let Ok(contents) = std::fs::read_to_string(path) {
                for line in contents.lines().skip(1) {
                    if let Some(event) = self.parse_proc_line(line, now) {
                        let key = format!("{}:{}", event.url, event.dest_port.unwrap_or(0));
                        if self.known_connections.insert(key) {
                            if let Ok(mut events) = self.events.lock() {
                                events.push(event);
                            }
                        }
                    }
                }
            }
        }
    }

    fn parse_proc_line(&self, line: &str, timestamp: u64) -> Option<NetworkEvent> {
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() < 4 {
            return None;
        }

        let local = fields[1];
        let remote = fields[2];
        let state_hex = fields[3];

        let local_port = parse_hex_port(local)?;
        let remote_port = parse_hex_port(remote)?;
        let remote_ip = parse_hex_ip(remote)?;
        let state = tcp_state_name(state_hex);

        // Only report established connections to non-local destinations
        if state != "ESTABLISHED" || remote_ip == "127.0.0.1" || remote_ip == "0.0.0.0" {
            return None;
        }

        Some(NetworkEvent {
            timestamp_ms: timestamp,
            method: None,
            url: remote_ip,
            status: None,
            content_type: None,
            body_size: None,
            source_port: Some(local_port),
            dest_port: Some(remote_port),
            state: Some(state.to_string()),
        })
    }
}

#[cfg(target_os = "linux")]
impl NetworkMonitor for ProcNetMonitor {
    fn start(&mut self) -> Result<(), NetworkError> {
        // Take initial snapshot so we only report NEW connections
        self.running = true;
        self.poll(); // Baseline — drain to ignore pre-existing
        if let Ok(mut events) = self.events.lock() {
            events.clear();
        }
        Ok(())
    }

    fn stop(&mut self) -> Result<(), NetworkError> {
        self.running = false;
        Ok(())
    }

    fn drain_events(&mut self) -> Vec<NetworkEvent> {
        self.poll();
        if let Ok(mut events) = self.events.lock() {
            std::mem::take(&mut *events)
        } else {
            vec![]
        }
    }

    fn is_running(&self) -> bool {
        self.running
    }
}

#[cfg(target_os = "linux")]
fn parse_hex_port(addr: &str) -> Option<u16> {
    let parts: Vec<&str> = addr.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    u16::from_str_radix(parts[1], 16).ok()
}

#[cfg(target_os = "linux")]
fn parse_hex_ip(addr: &str) -> Option<String> {
    let parts: Vec<&str> = addr.split(':').collect();
    if parts.is_empty() {
        return None;
    }
    let hex = parts[0];
    if hex.len() == 8 {
        // IPv4 in hex (little-endian on x86)
        let bytes: Vec<u8> = (0..8)
            .step_by(2)
            .filter_map(|i| u8::from_str_radix(&hex[i..i + 2], 16).ok())
            .collect();
        if bytes.len() == 4 {
            Some(format!("{}.{}.{}.{}", bytes[3], bytes[2], bytes[1], bytes[0]))
        } else {
            None
        }
    } else {
        // IPv6 — just return hex representation
        Some(hex.to_string())
    }
}

#[cfg(target_os = "linux")]
fn tcp_state_name(hex: &str) -> &str {
    match hex {
        "01" => "ESTABLISHED",
        "02" => "SYN_SENT",
        "03" => "SYN_RECV",
        "04" => "FIN_WAIT1",
        "05" => "FIN_WAIT2",
        "06" => "TIME_WAIT",
        "07" => "CLOSE",
        "08" => "CLOSE_WAIT",
        "09" => "LAST_ACK",
        "0A" => "LISTEN",
        "0B" => "CLOSING",
        _ => "UNKNOWN",
    }
}

/// Create a platform-appropriate network monitor.
pub fn create_monitor() -> Box<dyn NetworkMonitor> {
    #[cfg(target_os = "linux")]
    {
        return Box::new(ProcNetMonitor::new());
    }
    #[cfg(not(target_os = "linux"))]
    {
        Box::new(StubNetworkMonitor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stub_monitor_start_stop() {
        let mut monitor = StubNetworkMonitor;
        assert!(monitor.start().is_ok());
        assert!(!monitor.is_running());
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
            source_port: Some(54321),
            dest_port: Some(443),
            state: Some("ESTABLISHED".into()),
        };
        let json = serde_json::to_string(&event).unwrap();
        let back: NetworkEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(back.url, "https://api.example.com/data");
        assert_eq!(back.method.as_deref(), Some("GET"));
        assert_eq!(back.status, Some(200));
        assert_eq!(back.body_size, Some(4096));
        assert_eq!(back.dest_port, Some(443));
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
            source_port: None,
            dest_port: None,
            state: None,
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

    #[test]
    fn test_create_monitor() {
        let mut monitor = create_monitor();
        assert!(monitor.start().is_ok());
        let _ = monitor.drain_events();
        assert!(monitor.stop().is_ok());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn test_proc_net_monitor_lifecycle() {
        let mut monitor = ProcNetMonitor::new();
        assert!(!monitor.is_running());
        monitor.start().unwrap();
        assert!(monitor.is_running());
        let _events = monitor.drain_events(); // May or may not have events
        monitor.stop().unwrap();
        assert!(!monitor.is_running());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn test_parse_hex_port() {
        assert_eq!(parse_hex_port("0100007F:0050"), Some(80));
        assert_eq!(parse_hex_port("0100007F:01BB"), Some(443));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn test_parse_hex_ip() {
        assert_eq!(parse_hex_ip("0100007F:0050"), Some("127.0.0.1".to_string()));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn test_tcp_state_name() {
        assert_eq!(tcp_state_name("01"), "ESTABLISHED");
        assert_eq!(tcp_state_name("0A"), "LISTEN");
        assert_eq!(tcp_state_name("FF"), "UNKNOWN");
    }
}
