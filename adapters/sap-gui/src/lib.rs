//! SAP GUI Scripting Adapter (stub)
//!
//! Will provide native API access to SAP GUI via the SAP Scripting API.

use adapter_common::{Adapter, AdapterError, AdapterInfo};
use async_trait::async_trait;
use cel_context::ContextElement;

pub struct SapGuiAdapter;

impl SapGuiAdapter {
    pub fn new() -> Self { Self }
}

#[async_trait]
impl Adapter for SapGuiAdapter {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            name: "sap-gui".into(),
            display_name: "SAP GUI".into(),
            supported_versions: "7.x+".into(),
            platforms: vec!["windows".into()],
        }
    }
    async fn is_available(&self) -> bool { false }
    async fn connect(&mut self) -> Result<(), AdapterError> {
        Err(AdapterError::Unavailable("Not yet implemented".into()))
    }
    async fn disconnect(&mut self) -> Result<(), AdapterError> { Ok(()) }
    async fn get_elements(&self) -> Result<Vec<ContextElement>, AdapterError> { Ok(vec![]) }
    async fn execute_action(&self, action: &str, _params: serde_json::Value) -> Result<serde_json::Value, AdapterError> {
        Err(AdapterError::OperationFailed(format!("Action '{}' not implemented", action)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adapter_info() {
        let adapter = SapGuiAdapter::new();
        let info = adapter.info();
        assert_eq!(info.name, "sap-gui");
        assert_eq!(info.display_name, "SAP GUI");
        assert!(info.platforms.contains(&"windows".to_string()));
    }

    #[tokio::test]
    async fn test_not_available() {
        let adapter = SapGuiAdapter::new();
        assert!(!adapter.is_available().await);
    }

    #[tokio::test]
    async fn test_connect_fails() {
        let mut adapter = SapGuiAdapter::new();
        assert!(adapter.connect().await.is_err());
    }

    #[tokio::test]
    async fn test_disconnect_ok() {
        let mut adapter = SapGuiAdapter::new();
        assert!(adapter.disconnect().await.is_ok());
    }

    #[tokio::test]
    async fn test_get_elements_empty() {
        let adapter = SapGuiAdapter::new();
        let elements = adapter.get_elements().await.unwrap();
        assert!(elements.is_empty());
    }

    #[tokio::test]
    async fn test_execute_action_fails() {
        let adapter = SapGuiAdapter::new();
        let result = adapter.execute_action("test", serde_json::json!({})).await;
        assert!(result.is_err());
    }
}
