//! CDP Target Discovery
//!
//! Finds Chromium debug ports across all running apps without user configuration.

use std::collections::HashSet;
use std::path::PathBuf;

/// A discovered CDP debug target.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CdpTarget {
    pub app_name: String,
    pub pid: u32,
    pub port: u16,
    pub ws_url: String,
}

/// Discover all available CDP targets on this machine.
/// Combines multiple discovery strategies:
/// 1. Scan process args for --remote-debugging-port
/// 2. Scan DevToolsActivePort files in known app data directories
/// 3. Query discovered ports for WebSocket URLs
pub fn discover_cdp_targets() -> Vec<CdpTarget> {
    let mut seen_ports = HashSet::new();
    let mut targets = Vec::new();

    // Strategy 1: Scan process args
    for target in scan_process_args() {
        if seen_ports.insert(target.port) {
            targets.push(target);
        }
    }

    // Strategy 2: Scan DevToolsActivePort files
    for target in scan_devtools_port_files() {
        if seen_ports.insert(target.port) {
            targets.push(target);
        }
    }

    // Strategy 3: For each discovered port, query /json/list to get WebSocket URLs
    let mut enriched = Vec::new();
    for mut target in targets {
        if target.ws_url.is_empty() {
            if let Some(ws) = query_json_list(target.port) {
                target.ws_url = ws;
            }
        }
        if !target.ws_url.is_empty() {
            enriched.push(target);
        }
    }

    enriched
}

/// Scan running processes for --remote-debugging-port=N in their args.
fn scan_process_args() -> Vec<CdpTarget> {
    let mut targets = Vec::new();

    let output = match std::process::Command::new("ps")
        .args(["aux"])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return targets,
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if let Some(port_str) = extract_debug_port(line) {
            if let Ok(port) = port_str.parse::<u16>() {
                if port == 0 {
                    continue; // Port 0 means "assigned at runtime" — check DevToolsActivePort instead
                }
                let app_name = extract_app_name(line);
                targets.push(CdpTarget {
                    app_name,
                    pid: extract_pid(line),
                    port,
                    ws_url: String::new(), // Will be enriched later
                });
            }
        }
    }

    targets
}

/// Extract --remote-debugging-port=N value from a process command line.
fn extract_debug_port(line: &str) -> Option<&str> {
    let marker = "--remote-debugging-port=";
    let start = line.find(marker)? + marker.len();
    let rest = &line[start..];
    let end = rest.find(|c: char| !c.is_ascii_digit()).unwrap_or(rest.len());
    if end > 0 {
        Some(&rest[..end])
    } else {
        None
    }
}

/// Extract app name from a ps aux line.
fn extract_app_name(line: &str) -> String {
    // Look for .app in the full command string (not split by whitespace)
    if let Some(app_start) = line.find("/Applications/") {
        let rest = &line[app_start..];
        if let Some(app_end) = rest.find(".app") {
            let app_path = &rest["/Applications/".len()..app_end];
            // Handle nested paths like "Google Chrome.app/Contents/..."
            return app_path.split('/').next().unwrap_or("unknown").to_string();
        }
    }
    // Fallback: extract from command field
    let fields: Vec<&str> = line.split_whitespace().collect();
    if fields.len() > 10 {
        fields[10].split('/').last().unwrap_or("unknown").to_string()
    } else {
        "unknown".to_string()
    }
}

/// Extract PID from a ps aux line.
fn extract_pid(line: &str) -> u32 {
    let fields: Vec<&str> = line.split_whitespace().collect();
    if fields.len() > 1 {
        fields[1].parse().unwrap_or(0)
    } else {
        0
    }
}

/// Scan known app data directories for DevToolsActivePort files.
/// Chromium writes the debug port to this file when --remote-debugging-port=0 is used.
fn scan_devtools_port_files() -> Vec<CdpTarget> {
    let mut targets = Vec::new();
    let home = match std::env::var("HOME") {
        Ok(h) => h,
        Err(_) => return targets,
    };

    // Known app data directories on macOS
    let candidates = vec![
        ("Google Chrome", format!("{}/Library/Application Support/Google/Chrome", home)),
        ("Google Chrome Canary", format!("{}/Library/Application Support/Google/Chrome Canary", home)),
        ("Microsoft Edge", format!("{}/Library/Application Support/Microsoft Edge", home)),
        ("Brave Browser", format!("{}/Library/Application Support/BraveSoftware/Brave-Browser", home)),
        ("Arc", format!("{}/Library/Application Support/Arc", home)),
        ("Opera", format!("{}/Library/Application Support/com.operasoftware.Opera", home)),
        ("Claude", format!("{}/Library/Application Support/Claude", home)),
        ("Visual Studio Code", format!("{}/Library/Application Support/Code", home)),
        ("Slack", format!("{}/Library/Application Support/Slack", home)),
        ("Discord", format!("{}/Library/Application Support/discord", home)),
        ("Notion", format!("{}/Library/Application Support/Notion", home)),
        ("Obsidian", format!("{}/Library/Application Support/obsidian", home)),
    ];

    for (app_name, dir) in candidates {
        let port_file = PathBuf::from(&dir).join("DevToolsActivePort");
        if let Ok(contents) = std::fs::read_to_string(&port_file) {
            let lines: Vec<&str> = contents.lines().collect();
            if let Some(port_str) = lines.first() {
                if let Ok(port) = port_str.trim().parse::<u16>() {
                    let ws_path = lines.get(1).unwrap_or(&"");
                    let ws_url = if !ws_path.is_empty() {
                        format!("ws://127.0.0.1:{}{}", port, ws_path)
                    } else {
                        String::new()
                    };
                    targets.push(CdpTarget {
                        app_name: app_name.to_string(),
                        pid: 0, // DevToolsActivePort doesn't include PID
                        port,
                        ws_url,
                    });
                }
            }
        }
    }

    targets
}

/// Query a CDP port's /json/list endpoint to get the WebSocket debug URL.
fn query_json_list(port: u16) -> Option<String> {
    // Use a quick synchronous HTTP request
    let url = format!("http://127.0.0.1:{}/json/list", port);

    let output = std::process::Command::new("curl")
        .args(["-s", "--connect-timeout", "1", &url])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let body = String::from_utf8_lossy(&output.stdout);
    // Parse JSON array, find first "page" type target
    let entries: Vec<serde_json::Value> = serde_json::from_str(&body).ok()?;
    for entry in &entries {
        let entry_type = entry.get("type")?.as_str()?;
        if entry_type == "page" {
            return entry
                .get("webSocketDebuggerUrl")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
        }
    }
    // Fallback: any target
    entries
        .first()?
        .get("webSocketDebuggerUrl")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_debug_port() {
        assert_eq!(
            extract_debug_port("chrome --remote-debugging-port=9222 --other"),
            Some("9222")
        );
        assert_eq!(
            extract_debug_port("electron --remote-debugging-port=0"),
            Some("0")
        );
        assert_eq!(extract_debug_port("normal process"), None);
    }

    #[test]
    fn test_extract_app_name() {
        assert_eq!(
            extract_app_name("user  1234  0.0  0.0  0  0  ??  S  0:00.00  0  /Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
            "Google Chrome"
        );
    }

    #[test]
    fn test_discover_runs_without_panic() {
        // Just verify it doesn't crash — may or may not find targets
        let targets = discover_cdp_targets();
        // targets may be empty if no CDP apps are running
        let _ = targets;
    }
}
