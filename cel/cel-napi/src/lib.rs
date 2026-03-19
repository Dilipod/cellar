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
///
/// Wires up all available context sources:
/// - Accessibility tree (always)
/// - Display / screen capture (always)
/// - Network monitor (always — drains recent connections)
/// - Vision provider (optional — reads CEL_LLM_PROVIDER env var)
#[napi]
pub fn get_context() -> napi::Result<String> {
    let a11y = cel_accessibility::create_tree();
    let display = cel_display::create_capture();
    let network = cel_network::create_monitor();
    let mut merger = cel_context::ContextMerger::with_all(a11y, display, network);

    // Optionally attach vision provider from env vars
    if let Ok(vision) = cel_vision::create_provider_from_env() {
        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| napi::Error::from_reason(format!("Tokio runtime: {}", e)))?;
        merger = merger.with_vision(vision).with_runtime(rt.handle().clone());
    }

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

// --- Planner: cel-planner bindings ---

/// Plan a single step given a goal, current context, and step history.
/// Returns a JSON PlannedStep: { reasoning, action, expected_outcome, confidence }.
///
/// The caller runs the loop in TypeScript, calling this function per iteration
/// with fresh context and accumulated history.
#[napi]
pub async fn plan_step(
    goal: String,
    context_json: String,
    history_json: String,
    provider: Option<String>,
    api_key: Option<String>,
    model: Option<String>,
    endpoint: Option<String>,
    max_tokens: Option<u32>,
    max_steps: Option<u32>,
    loop_warning: Option<String>,
) -> napi::Result<String> {
    let llm = build_llm_client(provider.clone(), api_key, model.clone(), endpoint)?;

    let context: cel_context::ScreenContext = serde_json::from_str(&context_json)
        .map_err(|e| napi::Error::from_reason(format!("Invalid context JSON: {}", e)))?;

    let history_records: Vec<cel_planner::StepRecord> =
        serde_json::from_str(&history_json).unwrap_or_default();
    let step_count = history_records.len() as u32;
    let history = cel_planner::history::StepHistory::from_records(history_records);

    // Determine model tier for prompt optimization
    let model_id = model
        .or_else(|| provider.as_ref().map(|p| cel_llm::ProviderKind::from(p.as_str()).default_model().to_string()))
        .unwrap_or_default();
    let profile = cel_llm::ModelProfile::from_model_id(&model_id);
    let (context_detail, effective_max_steps) = match profile.tier {
        cel_llm::ModelTier::Flash => (cel_planner::ContextDetail::ActionableOnly, max_steps.unwrap_or(20)),
        cel_llm::ModelTier::Standard => (cel_planner::ContextDetail::Full, max_steps.unwrap_or(30)),
        cel_llm::ModelTier::Premium => (cel_planner::ContextDetail::Full, max_steps.unwrap_or(50)),
    };

    let system = cel_planner::prompt::system_prompt();
    let (max_elements, max_history, max_network) = match profile.tier {
        cel_llm::ModelTier::Flash => (20, 5, 0),      // Minimal for fast models
        cel_llm::ModelTier::Standard => (40, 10, 5),   // Default
        cel_llm::ModelTier::Premium => (60, 15, 10),   // Extended for capable models
    };
    let opts = cel_planner::prompt::PromptOptions {
        step_index: step_count,
        max_steps: effective_max_steps,
        loop_warning: loop_warning.as_deref(),
        context_detail,
        max_elements,
        max_history_steps: max_history,
        max_network_events: max_network,
    };
    let user = cel_planner::prompt::build_user_prompt(&goal, &context, &history, &opts);

    let raw = llm
        .complete(&system, &user, max_tokens.unwrap_or(2048))
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let cleaned = cel_llm::strip_code_fences(&raw);
    let step: cel_planner::PlannedStep = serde_json::from_str(cleaned).map_err(|e| {
        napi::Error::from_reason(format!(
            "LLM output parse error: {}. Raw: {}",
            e,
            &raw[..raw.len().min(500)]
        ))
    })?;

    serde_json::to_string(&step).map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Build the system + user prompts for planning WITHOUT calling the LLM.
/// Returns JSON: { "system": "...", "user": "..." }
///
/// Use this to get the exact same prompts that `plan_step` would use,
/// then call `llm_complete_with_image` separately with a screenshot attached.
/// This enables vision fallback in the TypeScript goal runner.
#[napi]
pub fn build_plan_prompt(
    goal: String,
    context_json: String,
    history_json: String,
    max_steps: Option<u32>,
    loop_warning: Option<String>,
    provider: Option<String>,
    model: Option<String>,
) -> napi::Result<String> {
    let context: cel_context::ScreenContext = serde_json::from_str(&context_json)
        .map_err(|e| napi::Error::from_reason(format!("Invalid context JSON: {}", e)))?;

    let history_records: Vec<cel_planner::StepRecord> =
        serde_json::from_str(&history_json).unwrap_or_default();
    let step_count = history_records.len() as u32;
    let history = cel_planner::history::StepHistory::from_records(history_records);

    // Determine model tier for prompt optimization
    let model_id = model
        .or_else(|| provider.as_ref().map(|p| cel_llm::ProviderKind::from(p.as_str()).default_model().to_string()))
        .unwrap_or_default();
    let profile = cel_llm::ModelProfile::from_model_id(&model_id);
    let (context_detail, effective_max_steps) = match profile.tier {
        cel_llm::ModelTier::Flash => (cel_planner::ContextDetail::ActionableOnly, max_steps.unwrap_or(20)),
        cel_llm::ModelTier::Standard => (cel_planner::ContextDetail::Full, max_steps.unwrap_or(30)),
        cel_llm::ModelTier::Premium => (cel_planner::ContextDetail::Full, max_steps.unwrap_or(50)),
    };

    let system = cel_planner::prompt::system_prompt();
    let (max_elements, max_history, max_network) = match profile.tier {
        cel_llm::ModelTier::Flash => (20, 5, 0),
        cel_llm::ModelTier::Standard => (40, 10, 5),
        cel_llm::ModelTier::Premium => (60, 15, 10),
    };
    let opts = cel_planner::prompt::PromptOptions {
        step_index: step_count,
        max_steps: effective_max_steps,
        loop_warning: loop_warning.as_deref(),
        context_detail,
        max_elements,
        max_history_steps: max_history,
        max_network_events: max_network,
    };
    let user = cel_planner::prompt::build_user_prompt(&goal, &context, &history, &opts);

    serde_json::to_string(&serde_json::json!({
        "system": system,
        "user": user,
    }))
    .map_err(|e| napi::Error::from_reason(e.to_string()))
}

// --- Context References ---

/// Create a resilient ContextReference from a ContextElement JSON.
/// The reference can be used to re-find the same element in future context snapshots.
///
/// `element_json`: JSON string of a ContextElement.
/// `screen_width`, `screen_height`: Screen dimensions for normalized coordinates.
///
/// Returns JSON string of ContextReference.
#[napi]
pub fn make_reference(
    element_json: String,
    screen_width: u32,
    screen_height: u32,
) -> napi::Result<String> {
    let element: cel_context::ContextElement = serde_json::from_str(&element_json)
        .map_err(|e| napi::Error::from_reason(format!("Invalid element JSON: {}", e)))?;
    let reference = element.to_reference(screen_width, screen_height);
    serde_json::to_string(&reference).map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Resolve a ContextReference against a ScreenContext snapshot.
/// Returns the best-matching ContextElement as JSON, or "null" if no match.
///
/// `context_json`: JSON string of a ScreenContext.
/// `reference_json`: JSON string of a ContextReference.
#[napi]
pub fn resolve_reference(
    context_json: String,
    reference_json: String,
) -> napi::Result<String> {
    let context: cel_context::ScreenContext = serde_json::from_str(&context_json)
        .map_err(|e| napi::Error::from_reason(format!("Invalid context JSON: {}", e)))?;
    let reference: cel_context::ContextReference = serde_json::from_str(&reference_json)
        .map_err(|e| napi::Error::from_reason(format!("Invalid reference JSON: {}", e)))?;

    match cel_context::resolve_reference(&context, &reference) {
        Some(element) => {
            serde_json::to_string(element).map_err(|e| napi::Error::from_reason(e.to_string()))
        }
        None => Ok("null".to_string()),
    }
}

// --- Focused Context ---

/// Get focused context for a single element by ID.
/// Returns high-fidelity data: element, subtree, ancestor path.
/// Returns JSON string of FocusedContext, or "null" if not found.
#[napi]
pub fn get_context_focused(element_id: String) -> napi::Result<String> {
    let a11y = cel_accessibility::create_tree();
    let display = cel_display::create_capture();
    let network = cel_network::create_monitor();
    let mut merger = cel_context::ContextMerger::with_all(a11y, display, network);

    match merger.get_context_focused(&element_id) {
        Some(focused) => {
            serde_json::to_string(&focused).map_err(|e| napi::Error::from_reason(e.to_string()))
        }
        None => Ok("null".to_string()),
    }
}

// --- Watchdog ---

static WATCHDOG: std::sync::OnceLock<Mutex<cel_context::ContextWatchdog>> =
    std::sync::OnceLock::new();

/// Initialize the context watchdog for change detection.
#[napi]
pub fn start_watchdog() -> napi::Result<()> {
    let _ = WATCHDOG.get_or_init(|| Mutex::new(cel_context::ContextWatchdog::new()));
    Ok(())
}

/// Poll for watchdog events by comparing current context against last snapshot.
/// Returns JSON array of CelEvents.
#[napi]
pub fn poll_events() -> napi::Result<String> {
    let wd_mutex = WATCHDOG
        .get()
        .ok_or_else(|| napi::Error::from_reason("Watchdog not started. Call start_watchdog() first.".to_string()))?;

    let mut wd = wd_mutex
        .lock()
        .map_err(|e| napi::Error::from_reason(format!("Watchdog lock poisoned: {}", e)))?;

    // Get fresh context
    let a11y = cel_accessibility::create_tree();
    let display = cel_display::create_capture();
    let network = cel_network::create_monitor();
    let mut merger = cel_context::ContextMerger::with_all(a11y, display, network);
    let context = merger.get_context();

    // Check network idle
    let network_idle = merger.recent_network_events().is_empty();

    let events = wd.tick(&context, network_idle);
    serde_json::to_string(&events).map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Stop and reset the watchdog.
#[napi]
pub fn stop_watchdog() -> napi::Result<()> {
    if let Some(wd_mutex) = WATCHDOG.get() {
        if let Ok(mut wd) = wd_mutex.lock() {
            wd.reset();
        }
    }
    Ok(())
}

// --- CDP ---

/// Install the LaunchAgent that enables CDP on all Electron apps.
/// Returns "installed" if newly installed, "already_installed" if already present.
#[napi]
pub fn cdp_setup_install() -> napi::Result<String> {
    match cel_cdp::install_cdp_launch_agent() {
        Ok(true) => Ok("installed".to_string()),
        Ok(false) => Ok("already_installed".to_string()),
        Err(e) => Err(napi::Error::from_reason(e)),
    }
}

/// Uninstall the CDP LaunchAgent.
#[napi]
pub fn cdp_setup_uninstall() -> napi::Result<String> {
    match cel_cdp::uninstall_cdp_launch_agent() {
        Ok(true) => Ok("uninstalled".to_string()),
        Ok(false) => Ok("not_installed".to_string()),
        Err(e) => Err(napi::Error::from_reason(e)),
    }
}

/// Check if the CDP LaunchAgent is installed.
#[napi]
pub fn cdp_is_setup() -> bool {
    cel_cdp::is_cdp_setup_installed()
}

/// Discover available CDP targets. Returns JSON array of CdpTarget.
#[napi]
pub fn cdp_discover_targets() -> napi::Result<String> {
    let targets = cel_cdp::discover_cdp_targets();
    serde_json::to_string(&targets).map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Extract page content from the first available CDP target.
/// Returns JSON string of PageContent, or "null" if no CDP target available.
#[napi]
pub async fn cdp_get_page_content() -> napi::Result<String> {
    let client = match cel_cdp::connect_to_focused_app().await {
        Some(c) => c,
        None => return Ok("null".to_string()),
    };

    match cel_cdp::extract_page_content(&client).await {
        Ok(content) => {
            serde_json::to_string(&content).map_err(|e| napi::Error::from_reason(e.to_string()))
        }
        Err(e) => Err(napi::Error::from_reason(format!("CDP content extraction failed: {}", e))),
    }
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
