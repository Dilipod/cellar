//! MetaTrader 4/5 Adapter (stub)
//!
//! Will provide native API access via MQL scripting bridge.

use adapter_common::{Adapter, AdapterError, AdapterInfo};
use async_trait::async_trait;
use cel_context::ContextElement;

pub struct MetaTraderAdapter;

impl MetaTraderAdapter {
    pub fn new() -> Self { Self }
}

#[async_trait]
impl Adapter for MetaTraderAdapter {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            name: "metatrader".into(),
            display_name: "MetaTrader 4/5".into(),
            supported_versions: "MT4, MT5".into(),
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
