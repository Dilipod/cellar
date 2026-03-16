//! CEL Node.js Native Bindings
//!
//! Exposes the CEL unified context API to TypeScript via napi-rs.

use napi_derive::napi;
use std::sync::Mutex;

/// Persistent input controller — avoids creating a new Enigo instance on every call.
static INPUT_CONTROLLER: std::sync::OnceLock<Mutex<Box<dyn cel_input::InputController>>> =
    std::sync::OnceLock::new();

fn with_controller<F, R>(f: F) -> napi::Result<R>
where
    F: FnOnce(&mut dyn cel_input::InputController) -> Result<R, cel_input::InputError>,
{
    let mutex = INPUT_CONTROLLER.get_or_init(|| {
        let ctrl = cel_input::create_controller().expect("Failed to create input controller");
        Mutex::new(ctrl)
    });
    let mut guard = mutex
        .lock()
        .map_err(|e| napi::Error::from_reason(format!("Controller lock poisoned: {}", e)))?;
    f(&mut **guard).map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Get the CEL runtime version.
#[napi]
pub fn cel_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Get the unified screen context — merges all available streams.
/// Returns JSON string of ScreenContext.
#[napi]
pub fn get_context() -> napi::Result<String> {
    let a11y = cel_accessibility::create_tree();
    let display = cel_display::create_capture();
    let mut merger = cel_context::ContextMerger::with_display(a11y, display);
    let context = merger.get_context();
    serde_json::to_string(&context).map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Capture a screenshot and return as base64-encoded PNG.
#[napi]
pub fn capture_screen() -> napi::Result<napi::bindgen_prelude::Buffer> {
    let mut capture = cel_display::create_capture();
    let frame = capture
        .capture_frame()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let png = cel_display::encode_png(&frame)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    Ok(png.into())
}

/// List available monitors. Returns JSON string.
#[napi]
pub fn list_monitors() -> napi::Result<String> {
    let capture = cel_display::create_capture();
    let monitors = capture
        .list_monitors()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    serde_json::to_string(&monitors).map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// List visible windows. Returns JSON string.
#[napi]
pub fn list_windows() -> napi::Result<String> {
    let capture = cel_display::create_capture();
    let windows = capture
        .list_windows()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    serde_json::to_string(&windows).map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Move the mouse to absolute screen coordinates.
#[napi]
pub fn mouse_move(x: i32, y: i32) -> napi::Result<()> {
    with_controller(|c| c.mouse_move(x, y))
}

/// Click at absolute screen coordinates.
#[napi]
pub fn click(x: i32, y: i32) -> napi::Result<()> {
    with_controller(|c| c.click(x, y, cel_input::MouseButton::Left))
}

/// Right-click at absolute screen coordinates.
#[napi]
pub fn right_click(x: i32, y: i32) -> napi::Result<()> {
    with_controller(|c| c.click(x, y, cel_input::MouseButton::Right))
}

/// Double-click at absolute screen coordinates.
#[napi]
pub fn double_click(x: i32, y: i32) -> napi::Result<()> {
    with_controller(|c| c.double_click(x, y, cel_input::MouseButton::Left))
}

/// Type a string of text.
#[napi]
pub fn type_text(text: String) -> napi::Result<()> {
    with_controller(|c| c.type_text(&text))
}

/// Press a single key (e.g., "Enter", "Tab", "Escape").
#[napi]
pub fn key_press(key: String) -> napi::Result<()> {
    with_controller(|c| c.key_press(&key))
}

/// Press a key combination (e.g., ["Ctrl", "C"]).
#[napi]
pub fn key_combo(keys: Vec<String>) -> napi::Result<()> {
    with_controller(|c| {
        let key_refs: Vec<&str> = keys.iter().map(|s| s.as_str()).collect();
        c.key_combo(&key_refs)
    })
}

/// Scroll at the current position.
#[napi]
pub fn scroll(dx: i32, dy: i32) -> napi::Result<()> {
    with_controller(|c| c.scroll(dx, dy))
}

/// Query the CEL Store knowledge layer. Returns JSON string.
#[napi]
pub fn query_knowledge(db_path: String, query: String) -> napi::Result<String> {
    let store =
        cel_store::CelStore::open(&db_path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let facts = store
        .query_knowledge(&query)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    serde_json::to_string(&facts).map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Add a knowledge fact to the CEL Store.
#[napi]
pub fn add_knowledge(db_path: String, content: String, source: String) -> napi::Result<i64> {
    let store =
        cel_store::CelStore::open(&db_path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let id = store
        .add_knowledge(&content, &source)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    Ok(id)
}

/// Start a workflow run in the CEL Store. Returns the run ID.
#[napi]
pub fn start_run(db_path: String, workflow_name: String, steps_total: u32) -> napi::Result<i64> {
    let store =
        cel_store::CelStore::open(&db_path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let id = store
        .start_run(&workflow_name, steps_total)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    Ok(id)
}

/// Finish a workflow run in the CEL Store.
#[napi]
pub fn finish_run(db_path: String, run_id: i64, status: String) -> napi::Result<()> {
    let store =
        cel_store::CelStore::open(&db_path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    store
        .finish_run(run_id, &status)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Log a step result during a workflow run.
#[napi]
pub fn log_step(
    db_path: String,
    run_id: i64,
    step_index: u32,
    step_id: String,
    action: String,
    success: bool,
    confidence: f64,
    context_snapshot: Option<String>,
    error: Option<String>,
) -> napi::Result<i64> {
    let store =
        cel_store::CelStore::open(&db_path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    store
        .log_step(
            run_id,
            step_index,
            &step_id,
            &action,
            success,
            confidence,
            context_snapshot.as_deref(),
            error.as_deref(),
        )
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Get run history from the CEL Store. Returns JSON string.
#[napi]
pub fn get_run_history(db_path: String, limit: u32) -> napi::Result<String> {
    let store =
        cel_store::CelStore::open(&db_path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let history = store
        .get_run_history(limit)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    serde_json::to_string(&history).map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Get step results for a specific run. Returns JSON string.
#[napi]
pub fn get_step_results(db_path: String, run_id: i64) -> napi::Result<String> {
    let store =
        cel_store::CelStore::open(&db_path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let steps = store
        .get_step_results(run_id)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    serde_json::to_string(&steps).map_err(|e| napi::Error::from_reason(e.to_string()))
}

// --- Memory: Working Memory ---

/// Get working memory for a workflow. Returns JSON string.
#[napi]
pub fn get_working_memory(db_path: String, workflow_name: String) -> napi::Result<String> {
    let store =
        cel_store::CelStore::open(&db_path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let wm = store
        .get_working_memory(&workflow_name)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    serde_json::to_string(&wm).map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Update working memory for a workflow.
#[napi]
pub fn update_working_memory(
    db_path: String,
    workflow_name: String,
    content: String,
) -> napi::Result<()> {
    let store =
        cel_store::CelStore::open(&db_path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    store
        .update_working_memory(&workflow_name, &content)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

// --- Memory: Observations ---

/// Add an observation. Returns the observation ID.
#[napi]
pub fn add_observation(
    db_path: String,
    workflow_name: String,
    content: String,
    priority: String,
    source_run_ids: Vec<i64>,
) -> napi::Result<i64> {
    let store =
        cel_store::CelStore::open(&db_path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let p = match priority.as_str() {
        "high" => cel_store::ObservationPriority::High,
        "low" => cel_store::ObservationPriority::Low,
        _ => cel_store::ObservationPriority::Medium,
    };
    store
        .add_observation(&workflow_name, &content, &p, &source_run_ids, None, None)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Get active observations for a workflow. Returns JSON string.
#[napi]
pub fn get_observations(
    db_path: String,
    workflow_name: String,
    limit: u32,
) -> napi::Result<String> {
    let store =
        cel_store::CelStore::open(&db_path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let obs = store
        .get_observations(&workflow_name, limit)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    serde_json::to_string(&obs).map_err(|e| napi::Error::from_reason(e.to_string()))
}

// --- Memory: Knowledge FTS5 Search ---

/// Search knowledge using FTS5 full-text search. Returns JSON string.
#[napi]
pub fn search_knowledge(
    db_path: String,
    query: String,
    workflow_scope: Option<String>,
    limit: u32,
) -> napi::Result<String> {
    let store =
        cel_store::CelStore::open(&db_path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let results = store
        .search_knowledge(&query, workflow_scope.as_deref(), limit)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    serde_json::to_string(&results).map_err(|e| napi::Error::from_reason(e.to_string()))
}

// --- Eviction / TTL ---

/// Run eviction policies. Returns JSON with counts of deleted rows.
#[napi]
pub fn run_eviction(
    db_path: String,
    run_retention_days: u32,
    knowledge_retention_days: u32,
) -> napi::Result<String> {
    let store =
        cel_store::CelStore::open(&db_path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let config = cel_store::EvictionConfig {
        run_retention_days,
        knowledge_retention_days,
    };
    let result = store
        .run_eviction(&config)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    serde_json::to_string(&result).map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Add a scoped knowledge fact. Returns the ID.
#[napi]
pub fn add_scoped_knowledge(
    db_path: String,
    content: String,
    source: String,
    workflow_scope: Option<String>,
    tags: Option<String>,
) -> napi::Result<i64> {
    let store =
        cel_store::CelStore::open(&db_path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    store
        .add_scoped_knowledge(&content, &source, workflow_scope.as_deref(), tags.as_deref())
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

// --- LLM: cel-llm bindings ---

/// Build an LLM client: uses explicit params if provided, otherwise reads env vars.
fn build_llm_client(
    provider: Option<String>,
    api_key: Option<String>,
    model: Option<String>,
    endpoint: Option<String>,
) -> napi::Result<cel_llm::LlmClient> {
    let config = match provider {
        Some(p) => cel_llm::LlmProviderConfig {
            provider: cel_llm::ProviderKind::from(p.as_str()),
            endpoint,
            api_key,
            model,
        },
        None => cel_llm::LlmProviderConfig::from_env().ok_or_else(|| {
            napi::Error::from_reason(
                "LLM not configured: set CEL_LLM_PROVIDER env var or pass provider param"
                    .to_string(),
            )
        })?,
    };
    cel_llm::LlmClient::new(config).map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Send a text-only LLM chat completion. Returns the model response string.
///
/// If `provider` is omitted, reads config from env vars (CEL_LLM_PROVIDER, etc.).
#[napi]
pub async fn llm_complete(
    system_prompt: String,
    user_prompt: String,
    provider: Option<String>,
    api_key: Option<String>,
    model: Option<String>,
    endpoint: Option<String>,
    max_tokens: Option<u32>,
) -> napi::Result<String> {
    let client = build_llm_client(provider, api_key, model, endpoint)?;
    client
        .complete(&system_prompt, &user_prompt, max_tokens.unwrap_or(4096))
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Send an LLM chat completion with an image. Returns the model response string.
///
/// If `provider` is omitted, reads config from env vars (CEL_LLM_PROVIDER, etc.).
#[napi]
pub async fn llm_complete_with_image(
    system_prompt: String,
    image_base64: String,
    user_prompt: String,
    provider: Option<String>,
    api_key: Option<String>,
    model: Option<String>,
    endpoint: Option<String>,
    max_tokens: Option<u32>,
) -> napi::Result<String> {
    let client = build_llm_client(provider, api_key, model, endpoint)?;
    let data_url = format!("data:image/png;base64,{}", image_base64);
    client
        .complete_with_image(
            &system_prompt,
            &data_url,
            &user_prompt,
            max_tokens.unwrap_or(4096),
        )
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}
