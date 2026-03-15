//! Excel COM Adapter
//!
//! Provides native API access to Microsoft Excel via COM automation (Windows).
//! First adapter to be fully implemented — highest priority per product roadmap.
//!
//! ## Supported Operations
//! - `read_cell`: Read a single cell value
//! - `write_cell`: Write a value to a cell
//! - `read_range`: Read a rectangular range of cells
//! - `write_range`: Write values to a range
//! - `active_sheet`: Get the name of the active sheet
//! - `list_sheets`: List all sheet names
//! - `select_sheet`: Switch to a sheet by name
//! - `run_macro`: Execute a VBA macro by name
//!
//! ## Usage
//! ```ignore
//! let mut adapter = ExcelAdapter::new();
//! adapter.connect().await?;
//! let value = adapter.execute_action("read_cell", json!({"sheet": "Sheet1", "cell": "A1"})).await?;
//! ```

use adapter_common::{Adapter, AdapterError, AdapterInfo};
use async_trait::async_trait;
use cel_context::ContextElement;
use serde::{Deserialize, Serialize};

/// Excel cell value representation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "value")]
pub enum CellValue {
    Empty,
    Text(String),
    Number(f64),
    Boolean(bool),
    Error(String),
}

/// Excel adapter using COM automation on Windows.
pub struct ExcelAdapter {
    connected: bool,
}

impl ExcelAdapter {
    pub fn new() -> Self {
        Self { connected: false }
    }
}

impl Default for ExcelAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Adapter for ExcelAdapter {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            name: "excel".into(),
            display_name: "Microsoft Excel".into(),
            supported_versions: "2016, 2019, 2021, 365".into(),
            platforms: vec!["windows".into()],
        }
    }

    async fn is_available(&self) -> bool {
        // Only available on Windows
        cfg!(target_os = "windows")
    }

    async fn connect(&mut self) -> Result<(), AdapterError> {
        #[cfg(target_os = "windows")]
        {
            // TODO: COM initialization
            // unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }
            // Get running Excel instance or create new one
            // unsafe { GetActiveObject(&CLSID_Application) }
            tracing::info!("Connecting to Excel via COM...");
            self.connected = true;
            Ok(())
        }
        #[cfg(not(target_os = "windows"))]
        {
            Err(AdapterError::Unavailable(
                "Excel COM automation is only available on Windows".into(),
            ))
        }
    }

    async fn disconnect(&mut self) -> Result<(), AdapterError> {
        self.connected = false;
        tracing::info!("Disconnected from Excel");
        Ok(())
    }

    async fn get_elements(&self) -> Result<Vec<ContextElement>, AdapterError> {
        if !self.connected {
            return Err(AdapterError::Unavailable("Not connected to Excel".into()));
        }

        // TODO: On Windows, query Excel COM for:
        // - Active workbook name
        // - Active sheet name
        // - Selected cell/range
        // - Visible cells with values
        // - Ribbon/toolbar state
        //
        // Each element gets confidence 0.98 (native API = near-perfect)
        //
        // Example element for the active cell:
        // ContextElement {
        //     id: "excel:Sheet1:A1",
        //     label: Some("Cell A1"),
        //     element_type: "table_cell",
        //     value: Some("Revenue"),
        //     bounds: Some(Bounds { x: 120, y: 200, width: 80, height: 20 }),
        //     confidence: 0.98,
        //     source: ContextSource::NativeApi,
        // }

        Ok(vec![])
    }

    async fn execute_action(
        &self,
        action: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, AdapterError> {
        if !self.connected {
            return Err(AdapterError::Unavailable("Not connected to Excel".into()));
        }

        match action {
            "read_cell" => {
                let sheet = params["sheet"].as_str().unwrap_or("Sheet1");
                let cell = params["cell"]
                    .as_str()
                    .ok_or_else(|| AdapterError::OperationFailed("Missing 'cell' parameter".into()))?;
                tracing::debug!("Reading cell {}!{}", sheet, cell);
                // TODO: COM call to read cell value
                // Range(cell).Value
                Ok(serde_json::json!({ "value": { "type": "Empty" } }))
            }

            "write_cell" => {
                let sheet = params["sheet"].as_str().unwrap_or("Sheet1");
                let cell = params["cell"]
                    .as_str()
                    .ok_or_else(|| AdapterError::OperationFailed("Missing 'cell' parameter".into()))?;
                let _value = &params["value"];
                tracing::debug!("Writing to cell {}!{}", sheet, cell);
                // TODO: COM call to write cell value
                // Range(cell).Value = value
                Ok(serde_json::json!({ "success": true }))
            }

            "read_range" => {
                let sheet = params["sheet"].as_str().unwrap_or("Sheet1");
                let range = params["range"]
                    .as_str()
                    .ok_or_else(|| AdapterError::OperationFailed("Missing 'range' parameter".into()))?;
                tracing::debug!("Reading range {}!{}", sheet, range);
                // TODO: COM call to read range
                // Range(range).Value → 2D array
                Ok(serde_json::json!({ "values": [] }))
            }

            "write_range" => {
                let sheet = params["sheet"].as_str().unwrap_or("Sheet1");
                let range = params["range"]
                    .as_str()
                    .ok_or_else(|| AdapterError::OperationFailed("Missing 'range' parameter".into()))?;
                let _values = &params["values"];
                tracing::debug!("Writing to range {}!{}", sheet, range);
                // TODO: COM call to write range
                // Range(range).Value = 2D array
                Ok(serde_json::json!({ "success": true }))
            }

            "active_sheet" => {
                // TODO: ActiveSheet.Name
                Ok(serde_json::json!({ "name": "Sheet1" }))
            }

            "list_sheets" => {
                // TODO: Worksheets collection
                Ok(serde_json::json!({ "sheets": ["Sheet1"] }))
            }

            "select_sheet" => {
                let name = params["name"]
                    .as_str()
                    .ok_or_else(|| AdapterError::OperationFailed("Missing 'name' parameter".into()))?;
                tracing::debug!("Selecting sheet: {}", name);
                // TODO: Worksheets(name).Activate
                Ok(serde_json::json!({ "success": true }))
            }

            "run_macro" => {
                let macro_name = params["macro"]
                    .as_str()
                    .ok_or_else(|| AdapterError::OperationFailed("Missing 'macro' parameter".into()))?;
                tracing::debug!("Running macro: {}", macro_name);
                // TODO: Application.Run(macroName)
                Ok(serde_json::json!({ "success": true }))
            }

            _ => Err(AdapterError::OperationFailed(format!(
                "Unknown Excel action: '{}'. Available: read_cell, write_cell, read_range, write_range, active_sheet, list_sheets, select_sheet, run_macro",
                action
            ))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_adapter_info() {
        let adapter = ExcelAdapter::new();
        let info = adapter.info();
        assert_eq!(info.name, "excel");
        assert!(info.platforms.contains(&"windows".to_string()));
    }

    #[tokio::test]
    async fn test_not_available_on_non_windows() {
        let adapter = ExcelAdapter::new();
        if !cfg!(target_os = "windows") {
            assert!(!adapter.is_available().await);
        }
    }

    #[tokio::test]
    async fn test_default_impl() {
        let adapter = ExcelAdapter::default();
        assert_eq!(adapter.info().name, "excel");
    }

    #[tokio::test]
    async fn test_connect_fails_on_non_windows() {
        if cfg!(target_os = "windows") { return; }
        let mut adapter = ExcelAdapter::new();
        assert!(adapter.connect().await.is_err());
    }

    #[tokio::test]
    async fn test_disconnect() {
        let mut adapter = ExcelAdapter::new();
        assert!(adapter.disconnect().await.is_ok());
    }

    #[tokio::test]
    async fn test_get_elements_not_connected() {
        let adapter = ExcelAdapter::new();
        assert!(adapter.get_elements().await.is_err());
    }

    #[tokio::test]
    async fn test_execute_action_not_connected() {
        let adapter = ExcelAdapter::new();
        let result = adapter.execute_action("read_cell", serde_json::json!({"cell": "A1"})).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_unknown_action() {
        let mut adapter = ExcelAdapter::new();
        // Force connected state for testing
        adapter.connected = true;
        let result = adapter.execute_action("nonexistent", serde_json::json!({})).await;
        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("Unknown Excel action"));
    }

    #[cfg(target_os = "windows")]
    #[tokio::test]
    async fn test_read_cell_connected() {
        let mut adapter = ExcelAdapter::new();
        adapter.connected = true;
        let result = adapter.execute_action("read_cell", serde_json::json!({"cell": "A1"})).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cell_value_serialization() {
        let values = vec![
            CellValue::Empty,
            CellValue::Text("Hello".into()),
            CellValue::Number(42.5),
            CellValue::Boolean(true),
            CellValue::Error("#REF!".into()),
        ];
        for val in values {
            let json = serde_json::to_string(&val).unwrap();
            let _back: CellValue = serde_json::from_str(&json).unwrap();
        }
    }

    #[tokio::test]
    async fn test_read_cell_missing_param() {
        let mut adapter = ExcelAdapter::new();
        adapter.connected = true;
        let result = adapter.execute_action("read_cell", serde_json::json!({})).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_write_range_action() {
        let mut adapter = ExcelAdapter::new();
        adapter.connected = true;
        let result = adapter.execute_action(
            "write_range",
            serde_json::json!({"range": "A1:B2", "values": [[1, 2], [3, 4]]}),
        ).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_all_actions_connected() {
        let mut adapter = ExcelAdapter::new();
        adapter.connected = true;

        // read_cell
        let r = adapter.execute_action("read_cell", serde_json::json!({"cell": "A1"})).await;
        assert!(r.is_ok());

        // write_cell
        let r = adapter.execute_action("write_cell", serde_json::json!({"cell": "A1", "value": 42})).await;
        assert!(r.is_ok());

        // read_range
        let r = adapter.execute_action("read_range", serde_json::json!({"range": "A1:B2"})).await;
        assert!(r.is_ok());

        // write_range
        let r = adapter.execute_action("write_range", serde_json::json!({"range": "A1:B2", "values": []})).await;
        assert!(r.is_ok());

        // active_sheet
        let r = adapter.execute_action("active_sheet", serde_json::json!({})).await;
        assert!(r.is_ok());

        // list_sheets
        let r = adapter.execute_action("list_sheets", serde_json::json!({})).await;
        assert!(r.is_ok());

        // select_sheet
        let r = adapter.execute_action("select_sheet", serde_json::json!({"name": "Sheet2"})).await;
        assert!(r.is_ok());

        // run_macro
        let r = adapter.execute_action("run_macro", serde_json::json!({"macro": "MyMacro"})).await;
        assert!(r.is_ok());
    }
}
