//! macOS Network Monitor
//!
//! Uses `lsof -i -n -P` to detect active network connections.
//! Similar to ProcNetMonitor on Linux but using lsof instead of /proc/net/tcp.

use crate::{NetworkError, NetworkEvent, NetworkMonitor};
use std::collections::HashSet;
use std::process::Command;

/// macOS network monitor using lsof.
pub struct LsofNetMonitor {
    running: bool,
    known_connections: HashSet<String>,
    events: Vec<NetworkEvent>,
    /// Track time of last new connection for idle detection.
    last_new_connection_ms: u64,
}

impl LsofNetMonitor {
    pub fn new() -> Self {
        Self {
            running: false,
            known_connections: HashSet::new(),
            events: Vec::new(),
            last_new_connection_ms: 0,
        }
    }

    /// Poll current connections via lsof and detect new ones.
    fn poll(&mut self) {
        if !self.running {
            return;
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let current = self.get_connections();
        for conn in &current {
            if self.known_connections.insert(conn.clone()) {
                // New connection detected
                self.last_new_connection_ms = now;
                if let Some(event) = parse_lsof_connection(conn, now) {
                    self.events.push(event);
                }
            }
        }
    }

    /// Get current network connections from lsof.
    fn get_connections(&self) -> HashSet<String> {
        let mut connections = HashSet::new();

        let output = Command::new("lsof")
            .args(["-i", "-n", "-P", "-F", "n"])
            .output();

        let output = match output {
            Ok(o) if o.status.success() => o,
            _ => return connections,
        };

        let stdout = String::from_utf8_lossy(&output.stdout);

        // lsof -F n outputs lines like:
        // p1234        (PID)
        // n*:8080      (listening)
        // n10.0.0.1:443->192.168.1.1:54321  (connection)
        for line in stdout.lines() {
            if let Some(rest) = line.strip_prefix('n') {
                // Only track established connections (contain "->")
                if rest.contains("->") {
                    connections.insert(rest.to_string());
                }
            }
        }

        connections
    }
}

impl NetworkMonitor for LsofNetMonitor {
    fn start(&mut self) -> Result<(), NetworkError> {
        self.running = true;
        // Baseline — capture existing connections so we only report new ones
        self.known_connections = self.get_connections();
        self.events.clear();
        self.last_new_connection_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        Ok(())
    }

    fn stop(&mut self) -> Result<(), NetworkError> {
        self.running = false;
        Ok(())
    }

    fn drain_events(&mut self) -> Vec<NetworkEvent> {
        self.poll();
        std::mem::take(&mut self.events)
    }

    fn is_running(&self) -> bool {
        self.running
    }
}

/// Parse a lsof connection string like "10.0.0.1:443->192.168.1.100:54321"
fn parse_lsof_connection(conn: &str, timestamp: u64) -> Option<NetworkEvent> {
    // Format: local_ip:local_port->remote_ip:remote_port
    let parts: Vec<&str> = conn.split("->").collect();
    if parts.len() != 2 {
        return None;
    }

    let local = parts[0];
    let remote = parts[1];

    let local_port = parse_port(local);
    let remote_port = parse_port(remote);
    let remote_ip = parse_ip(remote);

    // Skip localhost connections
    if let Some(ref ip) = remote_ip {
        if ip == "127.0.0.1" || ip == "::1" || ip.starts_with("[::1]") {
            return None;
        }
    }

    Some(NetworkEvent {
        timestamp_ms: timestamp,
        method: None,
        url: remote_ip.unwrap_or_else(|| remote.to_string()),
        status: None,
        content_type: None,
        body_size: None,
        source_port: local_port,
        dest_port: remote_port,
        state: Some("ESTABLISHED".to_string()),
    })
}

/// Extract port from "ip:port" or "[ipv6]:port".
fn parse_port(addr: &str) -> Option<u16> {
    // Handle IPv6: [::1]:port
    if let Some(bracket_end) = addr.rfind(']') {
        // [ipv6]:port
        let port_str = &addr[bracket_end + 2..]; // skip ]:
        return port_str.parse().ok();
    }
    // IPv4: ip:port — take last colon
    addr.rsplit_once(':')
        .and_then(|(_, port)| port.parse().ok())
}

/// Extract IP from "ip:port" or "[ipv6]:port".
fn parse_ip(addr: &str) -> Option<String> {
    if let Some(bracket_end) = addr.rfind(']') {
        // [ipv6]:port
        Some(addr[1..bracket_end].to_string())
    } else {
        // ip:port
        addr.rsplit_once(':').map(|(ip, _)| ip.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_lsof_connection_ipv4() {
        let event = parse_lsof_connection("192.168.1.100:54321->93.184.216.34:443", 1000);
        assert!(event.is_some());
        let e = event.unwrap();
        assert_eq!(e.url, "93.184.216.34");
        assert_eq!(e.dest_port, Some(443));
        assert_eq!(e.source_port, Some(54321));
    }

    #[test]
    fn test_parse_lsof_connection_localhost_filtered() {
        let event = parse_lsof_connection("127.0.0.1:3000->127.0.0.1:54321", 1000);
        assert!(event.is_none());
    }

    #[test]
    fn test_parse_port() {
        assert_eq!(parse_port("192.168.1.1:443"), Some(443));
        assert_eq!(parse_port("[::1]:8080"), Some(8080));
    }

    #[test]
    fn test_parse_ip() {
        assert_eq!(parse_ip("192.168.1.1:443"), Some("192.168.1.1".to_string()));
        assert_eq!(parse_ip("[::1]:8080"), Some("::1".to_string()));
    }

    #[test]
    fn test_lsof_monitor_lifecycle() {
        let mut monitor = LsofNetMonitor::new();
        assert!(!monitor.is_running());
        monitor.start().unwrap();
        assert!(monitor.is_running());
        let _events = monitor.drain_events();
        monitor.stop().unwrap();
        assert!(!monitor.is_running());
    }
}
