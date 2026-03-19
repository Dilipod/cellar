//! CEL CDP Layer
//!
//! Chrome DevTools Protocol client for extracting page content from
//! Chromium-based applications (browsers, Electron, CEF).
//!
//! CEL transparently enables CDP on Chromium apps via environment variables
//! and discovers active debug ports automatically.

mod discovery;
mod client;
mod content;
pub mod setup;

pub use discovery::{discover_cdp_targets, CdpTarget};
pub use client::{CdpClient, CdpError};
pub use content::{extract_page_content, PageContent, TextBlock, DomElement};
pub use setup::{install_cdp_launch_agent, uninstall_cdp_launch_agent, is_cdp_setup_installed};

/// Check if CDP is available for the currently focused app.
/// Returns a connected client if a CDP target is found, None otherwise.
pub async fn connect_to_focused_app() -> Option<CdpClient> {
    let targets = discover_cdp_targets();
    if targets.is_empty() {
        return None;
    }

    // Try the first target (usually the most recently active)
    for target in &targets {
        match CdpClient::connect(&target.ws_url).await {
            Ok(client) => return Some(client),
            Err(e) => {
                tracing::debug!("CDP connect failed for {}: {}", target.app_name, e);
            }
        }
    }
    None
}
