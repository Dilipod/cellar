//! CEL Node.js Native Bindings
//!
//! Exposes the CEL unified context API to TypeScript via napi-rs.

use napi_derive::napi;

/// Get the unified screen context — merges all available streams.
#[napi]
pub fn get_context() -> napi::Result<String> {
    let a11y = cel_accessibility::create_tree();
    let merger = cel_context::ContextMerger::new(a11y);
    let context = merger.get_context();
    serde_json::to_string(&context).map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Capture a screenshot and return as base64-encoded PNG.
#[napi]
pub fn capture_screen() -> napi::Result<String> {
    let mut capture = cel_display::create_capture();
    capture
        .init()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let frame = capture
        .capture_frame()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    // TODO: encode frame as PNG and base64
    Ok(format!(
        "frame:{}x{}:{}bytes",
        frame.width,
        frame.height,
        frame.data.len()
    ))
}

/// Move the mouse to absolute screen coordinates.
#[napi]
pub fn mouse_move(x: i32, y: i32) -> napi::Result<()> {
    let controller = cel_input::create_controller();
    controller
        .mouse_move(x, y)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Click at absolute screen coordinates.
#[napi]
pub fn click(x: i32, y: i32) -> napi::Result<()> {
    let controller = cel_input::create_controller();
    controller
        .click(x, y, cel_input::MouseButton::Left)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Type a string of text.
#[napi]
pub fn type_text(text: String) -> napi::Result<()> {
    let controller = cel_input::create_controller();
    controller
        .type_text(&text)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Query the CEL Store knowledge layer.
#[napi]
pub fn query_knowledge(db_path: String, query: String) -> napi::Result<String> {
    let store =
        cel_store::CelStore::open(&db_path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let facts = store
        .query_knowledge(&query)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    serde_json::to_string(&facts).map_err(|e| napi::Error::from_reason(e.to_string()))
}
