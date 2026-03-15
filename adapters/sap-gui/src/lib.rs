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
