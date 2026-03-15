//! Excel COM Adapter
//!
//! Provides native API access to Microsoft Excel via COM automation (Windows).
//! First adapter to be fully implemented — highest priority per product roadmap.

use adapter_common::{Adapter, AdapterError, AdapterInfo};
use async_trait::async_trait;
use cel_context::ContextElement;

pub struct ExcelAdapter {
    connected: bool,
}

impl ExcelAdapter {
    pub fn new() -> Self {
        Self { connected: false }
    }
}

#[async_trait]
impl Adapter for ExcelAdapter {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            name: "excel".into(),
            display_name: "Microsoft Excel".into(),
            supported_versions: "2016+".into(),
            platforms: vec!["windows".into()],
        }
    }

    async fn is_available(&self) -> bool {
        // TODO: Check if Excel process is running
        cfg!(target_os = "windows")
    }

    async fn connect(&mut self) -> Result<(), AdapterError> {
        // TODO: CoCreateInstance or GetActiveObject for Excel.Application
        #[cfg(target_os = "windows")]
        {
            tracing::info!("Connecting to Excel via COM...");
            self.connected = true;
            Ok(())
        }
        #[cfg(not(target_os = "windows"))]
        {
            Err(AdapterError::Unavailable(
                "Excel COM only available on Windows".into(),
            ))
        }
    }

    async fn disconnect(&mut self) -> Result<(), AdapterError> {
        self.connected = false;
        Ok(())
    }

    async fn get_elements(&self) -> Result<Vec<ContextElement>, AdapterError> {
        if !self.connected {
            return Err(AdapterError::Unavailable("Not connected".into()));
        }
        // TODO: Read workbook structure, active sheet, cell values via COM
        Ok(vec![])
    }

    async fn execute_action(
        &self,
        action: &str,
        _params: serde_json::Value,
    ) -> Result<serde_json::Value, AdapterError> {
        if !self.connected {
            return Err(AdapterError::Unavailable("Not connected".into()));
        }
        // TODO: Implement actions: read_cell, write_cell, navigate_sheet, run_macro
        Err(AdapterError::OperationFailed(format!(
            "Action '{}' not yet implemented",
            action
        )))
    }
}
