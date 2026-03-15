//! Bloomberg Terminal Adapter (stub)
//!
//! Will provide native API access via BLPAPI.

use adapter_common::{Adapter, AdapterError, AdapterInfo};
use async_trait::async_trait;
use cel_context::ContextElement;

pub struct BloombergAdapter;

impl BloombergAdapter {
    pub fn new() -> Self { Self }
}

#[async_trait]
impl Adapter for BloombergAdapter {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            name: "bloomberg".into(),
            display_name: "Bloomberg Terminal".into(),
            supported_versions: "BLPAPI 3.x".into(),
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
