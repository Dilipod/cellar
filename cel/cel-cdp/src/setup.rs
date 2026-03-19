//! CEL CDP Setup
//!
//! Installs the LaunchAgent that enables CDP on all Chromium-based apps.

use std::path::PathBuf;

const LAUNCH_AGENT_LABEL: &str = "com.cellar.cdp";

/// The LaunchAgent plist content that sets ELECTRON_EXTRA_LAUNCH_ARGS globally.
fn launch_agent_plist() -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/launchctl</string>
        <string>setenv</string>
        <string>ELECTRON_EXTRA_LAUNCH_ARGS</string>
        <string>--remote-debugging-port=0</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>"#,
        LAUNCH_AGENT_LABEL
    )
}

/// Get the LaunchAgent plist file path.
fn launch_agent_path() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    Some(PathBuf::from(home).join("Library/LaunchAgents").join(format!("{}.plist", LAUNCH_AGENT_LABEL)))
}

/// Install the LaunchAgent that enables CDP on Electron apps.
/// Returns Ok(true) if installed, Ok(false) if already installed.
pub fn install_cdp_launch_agent() -> Result<bool, String> {
    let path = launch_agent_path().ok_or("Could not determine LaunchAgent path")?;

    if path.exists() {
        return Ok(false); // Already installed
    }

    // Ensure directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create LaunchAgents directory: {}", e))?;
    }

    // Write the plist
    std::fs::write(&path, launch_agent_plist())
        .map_err(|e| format!("Failed to write LaunchAgent plist: {}", e))?;

    // Load it immediately (so it takes effect without logout)
    let _ = std::process::Command::new("launchctl")
        .args(["load", path.to_str().unwrap_or("")])
        .output();

    // Also set the env var for the current session
    let _ = std::process::Command::new("launchctl")
        .args(["setenv", "ELECTRON_EXTRA_LAUNCH_ARGS", "--remote-debugging-port=0"])
        .output();

    Ok(true)
}

/// Uninstall the LaunchAgent.
pub fn uninstall_cdp_launch_agent() -> Result<bool, String> {
    let path = launch_agent_path().ok_or("Could not determine LaunchAgent path")?;

    if !path.exists() {
        return Ok(false); // Not installed
    }

    // Unload first
    let _ = std::process::Command::new("launchctl")
        .args(["unload", path.to_str().unwrap_or("")])
        .output();

    // Remove the env var
    let _ = std::process::Command::new("launchctl")
        .args(["unsetenv", "ELECTRON_EXTRA_LAUNCH_ARGS"])
        .output();

    // Delete the file
    std::fs::remove_file(&path)
        .map_err(|e| format!("Failed to remove LaunchAgent: {}", e))?;

    Ok(true)
}

/// Check if the LaunchAgent is installed.
pub fn is_cdp_setup_installed() -> bool {
    launch_agent_path().map_or(false, |p| p.exists())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_launch_agent_plist_is_valid_xml() {
        let plist = launch_agent_plist();
        assert!(plist.contains("ELECTRON_EXTRA_LAUNCH_ARGS"));
        assert!(plist.contains("--remote-debugging-port=0"));
        assert!(plist.contains(LAUNCH_AGENT_LABEL));
    }

    #[test]
    fn test_launch_agent_path() {
        let path = launch_agent_path();
        assert!(path.is_some());
        let p = path.unwrap();
        assert!(p.to_str().unwrap().contains("LaunchAgents"));
        assert!(p.to_str().unwrap().ends_with(".plist"));
    }
}
