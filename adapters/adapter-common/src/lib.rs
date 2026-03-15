//! Common Adapter Interface
//!
//! Defines the trait that all app-specific adapters implement.
//! Adapters provide native API access to specific applications,
//! giving the highest confidence context and most reliable actions.
//!
//! License: MIT (adapters are MIT-licensed to encourage community contributions)

use async_trait::async_trait;
use cel_context::ContextElement;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AdapterError {
    #[error("App not running or not found")]
    AppNotFound,
    #[error("Adapter not available: {0}")]
    Unavailable(String),
    #[error("Operation failed: {0}")]
    OperationFailed(String),
    #[error("Connection lost")]
    ConnectionLost,
}

/// Metadata about an adapter.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdapterInfo {
    /// Adapter name (e.g., "excel", "sap-gui").
    pub name: String,
    /// Display name (e.g., "Microsoft Excel").
    pub display_name: String,
    /// Supported app version range.
    pub supported_versions: String,
    /// Platform support.
    pub platforms: Vec<String>,
}

/// The core adapter trait that all app-specific adapters implement.
#[async_trait]
pub trait Adapter: Send + Sync {
    /// Get adapter metadata.
    fn info(&self) -> AdapterInfo;

    /// Check if the target app is running and accessible.
    async fn is_available(&self) -> bool;

    /// Connect to the target app's native API.
    async fn connect(&mut self) -> Result<(), AdapterError>;

    /// Disconnect from the target app.
    async fn disconnect(&mut self) -> Result<(), AdapterError>;

    /// Get context elements from the app's native API.
    /// These elements have the highest confidence (0.95+).
    async fn get_elements(&self) -> Result<Vec<ContextElement>, AdapterError>;

    /// Execute a named action on the app.
    async fn execute_action(
        &self,
        action: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, AdapterError>;
}
