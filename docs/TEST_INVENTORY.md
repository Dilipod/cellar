# Cellar Test Inventory

> 355 tests across 3 layers — Rust, TypeScript unit, and Playwright E2E.

## Quick Reference

| Layer | Framework | Tests | Command |
|-------|-----------|------:|---------|
| Rust unit + integration | `cargo test` | 178 | `make test-rust` |
| TypeScript unit | vitest | 125 | `make test-ts` |
| Playwright E2E | Playwright | 52 | `make test-e2e` |
| Playwright E2E (full, with browser) | Playwright | 67 | `make test-e2e-ui` |
| **Total** | | **355** (or 370 with browser tests) | `make test` + `make test-e2e` |

---

## 1. Rust Unit Tests (178 tests)

### cel-accessibility (16 tests)

| Test | File | What It Validates |
|------|------|-------------------|
| `test_stub_get_tree` | `lib.rs:41` | Stub returns root element with id "root", role Window |
| `test_stub_find_elements_returns_empty` | `lib.rs:54` | Stub find returns empty vec |
| `test_stub_focused_element_returns_none` | `lib.rs:61` | Stub focused element is None |
| `test_create_tree_returns_working_instance` | `lib.rs:68` | Platform factory returns valid provider |
| `test_element_role_all_variants` | `lib.rs:76` | All 27 ElementRole variants serialize/deserialize |
| `test_element_state_defaults` | `lib.rs:96` | ElementState field defaults |
| `test_element_state_serialization` | `lib.rs:111` | State JSON roundtrip with expanded/checked |
| `test_bounds_serialization` | `lib.rs:128` | Bounds JSON roundtrip |
| `test_accessibility_element_with_children` | `lib.rs:139` | Parent-child tree construction |
| `test_accessibility_element_serialization_roundtrip` | `lib.rs:170` | Full element JSON roundtrip |
| `test_accessibility_error_display` | `lib.rs:190` | Error variant display strings |
| `test_make_root_element` | `linux.rs:409` | Root element factory with empty children |
| `test_make_root_with_children` | `linux.rs:416` | Root element factory with children |
| `test_collect_matching_by_role` | `linux.rs:439` | Tree search by ElementRole |
| `test_atspi_role_mapping` | `linux.rs:497` | AT-SPI2 role strings → ElementRole (push button, entry, check box, combo box, menu bar, page tab, table, tree, link, slider, panel, image, unknown) |
| `test_collect_matching_by_label` | `linux.rs:515` | Tree search by label substring |

### cel-context (17 tests — 13 unit + 4 integration)

**Unit tests (merge.rs, confidence.rs):**

| Test | What It Validates |
|------|-------------------|
| `test_bounds_overlap_full` | IoU = 1.0 for identical bounds |
| `test_bounds_overlap_none` | IoU = 0.0 for non-overlapping bounds |
| `test_bounds_overlap_partial` | IoU between 0 and 1 for partial overlap |
| `test_bounds_overlap_adjacent` | IoU = 0.0 for touching but non-overlapping bounds |
| `test_bounds_overlap_contained` | IoU > 0 when one bounds contains another |
| `test_get_context_with_stub` | Stub accessibility → valid ScreenContext with timestamp |
| `test_merge_native_elements_overrides_by_id` | Native adapter element replaces a11y element by ID |
| `test_merge_native_elements_adds_new` | Native adapter element appended when no ID match |
| `test_merge_vision_elements_no_overlap` | Vision elements added when no spatial overlap |
| `test_merge_vision_elements_dominated_by_existing` | Vision elements dropped when IoU > 0.5 with existing |
| `test_elements_sorted_by_confidence` | Output sorted highest confidence first |
| `test_role_to_string_all_variants` | All ElementRole variants → element_type strings |
| `test_recent_network_events_empty` | Empty network events on new merger |
| `test_with_all_constructor` | Constructor with accessibility + network |
| `test_is_actionable_type` | button, input, link, checkbox → true; window, text, group → false |
| `test_confidence_thresholds` | Score → behavior mapping (0.95→ActImmediately, 0.8→ActAndLog, 0.6→ActCautiously, 0.3→PauseAndNotify) |

**Integration tests (tests/integration.rs):**

| Test | What It Validates |
|------|-------------------|
| `test_confidence_thresholds_default` | Default thresholds work correctly |
| `test_context_element_serialization` | ContextElement JSON roundtrip |
| `test_screen_context_serialization` | ScreenContext JSON roundtrip with network events |
| `test_context_source_variants` | All 4 source variants are distinct |

### cel-display (10 tests)

| Test | What It Validates |
|------|-------------------|
| `test_frame_creation` | Frame struct with RGBA data, dimensions, timestamp |
| `test_frame_serialization_roundtrip` | Frame JSON roundtrip |
| `test_encode_png_valid_2x2` | 2x2 frame → valid PNG bytes |
| `test_encode_png_invalid_dimensions` | Mismatched dimensions → EncodingError |
| `test_encode_png_single_pixel` | 1x1 frame → valid PNG |
| `test_monitor_info_serialization` | MonitorInfo JSON roundtrip |
| `test_window_info_serialization` | WindowInfo JSON roundtrip |
| `test_capture_error_display` | All CaptureError variant display strings |
| `test_create_capture_returns_instance` | Platform capture factory works |
| `test_latest_frame_type` | Arc<RwLock<Option<Frame>>> type check |

### cel-input (8 tests)

| Test | What It Validates |
|------|-------------------|
| `test_mouse_button_serialization` | MouseButton Left/Right/Middle JSON roundtrip |
| `test_input_event_mouse_move` | MouseMove event with coordinates |
| `test_input_event_click` | Click event with position and button |
| `test_input_event_key_press` | KeyPress event with key string |
| `test_input_event_type_text` | TypeText event with text content |
| `test_input_event_scroll` | Scroll event with dx/dy |
| `test_all_input_event_variants_serializable` | All 6 InputEvent variants serialize |
| `test_input_error_display` | InputError variant display strings |

### cel-llm (19 tests)

| Test | What It Validates |
|------|-------------------|
| `test_provider_kind_from_str` | "openai", "anthropic", "ollama" parsing |
| `test_provider_defaults` | Default model and endpoint per provider |
| `test_from_env_not_set` | Missing env → None |
| `test_from_env_basic` | CEL_LLM_PROVIDER env → config |
| `test_from_env_provider_specific_key` | OPENAI_API_KEY env → config |
| `test_config_resolved` | Config resolution with defaults |
| `test_base64_encode` | base64 encoding utility |
| `test_strip_code_fences_json` | Strip ```json fences from LLM output |
| `test_strip_code_fences_plain` | Strip plain ``` fences |
| `test_strip_code_fences_none` | No fences → passthrough |
| `test_chat_message_text` | ChatMessage::text constructor |
| `test_chat_message_image` | ChatMessage::image constructor |
| `test_client_creation` | LlmClient::new with OpenAI config |
| `test_client_anthropic` | LlmClient::new with Anthropic config |
| `test_client_not_configured` | LlmClient::new returns Err without config |
| `test_client_custom_endpoint` | Custom endpoint URL in config |
| `test_parse_data_url` | Parse data:image/png;base64 URLs |
| `test_parse_data_url_jpeg` | Parse JPEG data URLs |
| `test_parse_data_url_fallback` | Invalid data URL fallback |

### cel-network (10 tests)

| Test | What It Validates |
|------|-------------------|
| `test_stub_monitor_start_stop` | Stub monitor lifecycle |
| `test_stub_monitor_drain_empty` | Stub drain returns empty vec |
| `test_network_event_serialization` | NetworkEvent JSON roundtrip |
| `test_network_event_minimal` | Event with only required fields |
| `test_network_error_display` | NetworkError variant display strings |
| `test_create_monitor` | Platform monitor factory |
| `test_proc_net_monitor_lifecycle` | /proc/net TCP monitor start/stop |
| `test_parse_hex_port` | Hex port → u16 (e.g. "01BB" → 443) |
| `test_parse_hex_ip` | Hex IP → string (e.g. "0100007F" → "127.0.0.1") |
| `test_tcp_state_name` | TCP state codes → names |

### cel-vision (2 tests)

| Test | What It Validates |
|------|-------------------|
| `test_parse_vision_elements` | Parse JSON array of vision-detected elements |
| `test_parse_markdown_wrapped` | Parse vision elements from markdown-wrapped JSON |

### cel-store (43 tests — 40 unit + 3 integration)

**schema.rs (7 tests):**

| Test | What It Validates |
|------|-------------------|
| `test_store_open_and_migrate` | SQLite store opens and runs migrations |
| `test_knowledge_roundtrip` | add_knowledge → query_knowledge |
| `test_run_tracking` | start_run → finish_run lifecycle |
| `test_log_step_and_retrieve` | Log step → get_step_results |
| `test_steps_completed_auto_updates` | steps_completed auto-increments on log_step |
| `test_get_run_history` | Run history ordered by recency |
| `test_record_intervention` | Record user intervention on a run |

**memory.rs (14 tests):**

| Test | What It Validates |
|------|-------------------|
| `test_working_memory_create_and_get` | Create and retrieve working memory per workflow |
| `test_working_memory_update` | Update existing working memory content |
| `test_working_memory_update_existing` | Update overwrites previous content |
| `test_working_memory_isolation` | Different workflows have independent memory |
| `test_add_and_get_observations` | Add observations with priority and source run IDs |
| `test_observation_supersede` | Superseded observations excluded from active results |
| `test_scoped_knowledge_fts5_search` | FTS5 full-text search with workflow scope |
| `test_knowledge_fts5_no_results` | FTS5 returns empty for non-matching query |
| `test_knowledge_score_ranking` | FTS5 results ordered by relevance score |
| `test_observation_priority_ordering` | Observations ordered by priority (high > medium > low) |
| `test_evict_superseded_observations` | Eviction removes superseded observations |
| `test_cap_observations` | Oldest observations evicted when cap exceeded |
| `test_evict_old_runs` | TTL-based run eviction |
| `test_evict_old_runs_keeps_recent` | Recent runs survive eviction |
| `test_run_eviction_with_config` | EvictionConfig controls retention days |
| `test_eviction_config_defaults` | Default retention: 90 days runs, 365 days knowledge |

**filesystem.rs (11 tests):**

| Test | What It Validates |
|------|-------------------|
| `test_init_creates_directories` | FileStore::init creates directory structure |
| `test_screenshot_save_and_load` | Save PNG → load PNG roundtrip |
| `test_screenshot_not_found` | Missing screenshot returns error |
| `test_list_screenshots` | List screenshots for a run |
| `test_list_screenshots_empty_run` | Empty run returns empty list |
| `test_transcript_append_and_read` | Append JSONL entries → read back |
| `test_transcript_empty_run` | Empty run transcript returns empty |
| `test_transcript_size` | Transcript byte count |
| `test_delete_run_data` | Delete run removes all data |
| `test_db_path` | Database path construction |
| `test_transcript_entry_serialization` | TranscriptEntry JSON roundtrip |

**pgvector.rs (6 tests):**

| Test | What It Validates |
|------|-------------------|
| `test_default_config` | Default pgvector config values |
| `test_migration_sql_hnsw` | HNSW index migration SQL generation |
| `test_migration_sql_ivfflat` | IVFFlat index migration SQL generation |
| `test_migration_sql_custom_schema` | Custom schema in migration SQL |
| `test_hybrid_search_sql` | Hybrid vector + FTS search SQL |
| `test_config_serialization` | PgVectorConfig JSON roundtrip |

**Integration tests (3 tests):**

| Test | What It Validates |
|------|-------------------|
| `test_store_lifecycle` | Full add → query knowledge lifecycle |
| `test_run_tracking` | Full run start → finish lifecycle |
| `test_independent_stores` | Multiple stores maintain separate data |

### Adapters (29 tests)

**adapter-common (3 tests):**

| Test | What It Validates |
|------|-------------------|
| `test_adapter_info_serialization` | AdapterInfo JSON roundtrip |
| `test_adapter_error_display` | AdapterError display strings |
| `test_adapter_info_clone` | AdapterInfo Clone impl |

**adapter-excel (12 tests):**

| Test | What It Validates |
|------|-------------------|
| `test_adapter_info` | Excel adapter info fields |
| `test_not_available_on_non_windows` | Not available on Linux/macOS |
| `test_default_impl` | Default constructor |
| `test_connect_fails_on_non_windows` | Connect fails gracefully on non-Windows |
| `test_disconnect` | Disconnect is safe when not connected |
| `test_get_elements_not_connected` | Returns empty when not connected |
| `test_execute_action_not_connected` | Returns error when not connected |
| `test_unknown_action` | Unknown action returns error |
| `test_read_cell_connected` | Read cell action structure |
| `test_cell_value_serialization` | CellValue JSON roundtrip |
| `test_read_cell_missing_param` | Missing cell param → error |
| `test_write_range_action` | Write range action structure |
| `test_all_actions_connected` | All supported actions enumerated |

**adapter-bloomberg (4 tests):** `test_adapter_info`, `test_not_available`, `test_connect_fails`, `test_get_elements_empty`

**adapter-metatrader (4 tests):** `test_adapter_info`, `test_not_available`, `test_connect_fails`, `test_get_elements_empty`

**adapter-sap-gui (6 tests):** `test_adapter_info`, `test_not_available`, `test_connect_fails`, `test_disconnect_ok`, `test_get_elements_empty`, `test_execute_action_fails`

---

## 2. TypeScript Unit Tests (125 tests)

### @cellar/agent (74 tests across 8 files)

**engine.test.ts (9 tests):**

| Test | What It Validates |
|------|-------------------|
| `should submit workflows and return an ID` | submit() returns "wf-*" pattern ID |
| `should execute all steps of a workflow` | Full workflow execution with onComplete("completed") |
| `should stop on step failure` | executeAction false → onComplete("failed") |
| `should stop on step exception` | Thrown error → onComplete("failed") |
| `should call onPause when confidence is too low` | Low confidence → onPause callback |
| `should not start twice` | start() idempotent |
| `should handle priority in submission` | Different priorities → unique IDs |
| `should pass assembled context to callbacks` | AssembledContext contains workflow, screen, currentStep |
| `should track completed steps across the run` | StepResult array in onComplete |

**action-executor.test.ts (10 tests):**

| Test | What It Validates |
|------|-------------------|
| `should click a target by ID` | Element lookup → click at center |
| `should right-click when button is right` | rightClick() called |
| `should throw when click target not found` | Missing element → error |
| `should type text into a target field` | Click field → typeText |
| `should press a key` | keyPress() called |
| `should press a key combo` | keyCombo() called |
| `should wait for specified duration` | Async delay |
| `should scroll` | scroll(dx, dy) called |
| `should handle custom actions gracefully` | Unknown adapter → true |
| `should resolve target by label (case-insensitive)` | Label fallback lookup |

**context-assembly.test.ts (6 tests):**

| Test | What It Validates |
|------|-------------------|
| `should assemble all context layers` | Merges memory, observations, knowledge, screen |
| `should pass workflow name to memory lookups` | Correct workflow scoping |
| `should limit recent steps` | maxRecentSteps cap |
| `should use custom config` | Custom maxObservations/maxKnowledge |
| `should handle empty memory gracefully` | Empty sources don't crash |
| `should format a readable summary` | formatContextSummary output |

**queue.test.ts (10 tests):** Enqueue/dequeue, empty queue, active workflow blocking, priority ordering, timestamps, unique IDs.

**transcript.test.ts (10 tests):** File creation, append, context capture logging, failure logging, pause logging, intervention logging, observation logging, run stats, non-existent transcript, file path.

**post-run.test.ts (9 tests):** Observation creation from perfect/failed/low-confidence runs, failure knowledge extraction, working memory update, memory cap (5 runs), result counts, empty steps.

**types.test.ts (8 tests):** Type validation for ContextElement, ScreenContext, all action types, WorkflowStep, Workflow, Priority, WorkflowStatus, optional fields.

**workflow-io.test.ts (12 tests):** Save/load JSON, directory creation, list/delete workflows, export .dilipod format, import .dilipod format, round-trip, invalid format rejection.

### @cellar/recorder (19 tests)

**ExplicitRecorder (10 tests):**

| Test | What It Validates |
|------|-------------------|
| `should start and stop recording` | isRecording toggles |
| `should record steps` | Steps stored with action + context |
| `should not record when not recording` | Ignores steps before start() |
| `should reset steps on start` | start() clears previous |
| `should convert to workflow` | toWorkflow() output structure |
| `should handle empty recording for toWorkflow` | Zero steps → valid workflow |
| `should identify target elements` | Element lookup by ID/label |
| `should track step count` | stepCount property |
| `should generate proper workflow actions` | Action string parsing (click, type, key, etc.) |
| `should set expected context from next step` | Forward context linking |

**PassiveRecorder (9 tests):**

| Test | What It Validates |
|------|-------------------|
| `should start and stop observation` | Lifecycle safety |
| `should return empty patterns initially` | No patterns before recording |
| `should not process context when not recording` | onContext ignored |
| `should process context when recording` | onContext accepted |
| `should detect app-switch patterns` | Alternating apps → pattern |
| `should detect heavy app usage` | Dominant app → burst pattern |
| `should create workflow draft from pattern` | toWorkflowDraft() output |
| `should set frequency` | setFrequency() accepts values |
| `should cap history size` | 1000 entry cap |

### @cellar/live-view (16 tests)

**server.test.ts (6 tests):** Default config, custom config, partial config, start/stop without callbacks, stop when not started, multiple stop calls.

**context-feed.test.ts (10 tests):** Record entries, confidence levels (high ≥0.9, medium 0.7–0.9, low 0.5–0.7, paused <0.5), empty context, getRecent count, history cap (1000), timestamps, optional intent/reasoning.

### @cellar/registry (16 tests)

**RegistryClient (11 tests):** Default/custom URL, unreachable registry → empty results, search parsing, get not found, get parsing, download failure, download success, type filter, ping reachable/unreachable.

**Workflow I/O (5 tests):** Export/import roundtrip, non-existent source errors, invalid .dilipod rejection, entry structure validation.

---

## 3. Playwright E2E Tests (52 headless + 15 browser)

### agent-engine (10 tests)

| Test | What It Validates |
|------|-------------------|
| `executes a complete login workflow with all steps succeeding` | 5-step login: all callbacks in order, status "completed" |
| `stops execution on step failure` | Step 2 fails → only 2 executed, status "failed" |
| `handles step execution errors gracefully` | Thrown error → logged, status "failed" |
| `context is fetched before each step` | getContext called 5 times for 5 steps |
| `pauses when element confidence is below threshold` | Low confidence → onPause invoked |
| `does not pause when confidence is above threshold` | High confidence → no pauses |
| `executes workflows in priority order` | High priority completes before low |
| `stop() halts engine after current workflow` | Engine stops between workflows |
| `start() is idempotent` | Double start → single execution |
| `logs workflow start, step progress, and completion` | Log entries for lifecycle events |

### recorder (17 tests)

**Passive (7 tests):**

| Test | What It Validates |
|------|-------------------|
| `detects app-switch patterns from alternating contexts` | Firefox ↔ VS Code → "App switch" pattern, ≥3 occurrences |
| `detects heavy app usage bursts` | 20× VS Code → "Heavy usage" pattern |
| `does not detect patterns from too few observations` | 3 observations → no patterns |
| `ignores context when not recording` | 100 observations before start() → no patterns |
| `respects history cap (1000 entries)` | 1500 pushed → capped without crash |
| `converts detected pattern to workflow draft` | Pattern → workflow with valid action types |
| `frequency setting affects pattern detection cadence` | High frequency catches patterns earlier |

**Explicit (9 tests):**

| Test | What It Validates |
|------|-------------------|
| `records steps with full context` | Action, context, targetElement stored correctly |
| `identifies target element by label` | Label fallback when ID doesn't match |
| `generates a complete workflow` | 5 steps → workflow with actions, descriptions, context_map |
| `sets expected context from the next step's context` | Forward-looking expected field |
| `sets min_confidence from target element confidence` | max(0.5, confidence - 0.1) |
| `handles key combo recording` | key_combo:ctrl:s → keys: ["ctrl", "s"] |
| `handles scroll recording` | scroll:0:100 → dx: 0, dy: 100 |
| `isRecording and stepCount properties are accurate` | State tracking throughout lifecycle |
| `does not record steps when not in recording mode` | Pre-start steps ignored |

**Integration (1 test):**

| Test | What It Validates |
|------|-------------------|
| `passive detection → explicit refinement → valid workflow` | Full training pipeline |

### context-pipeline (25 tests)

**Element Invariants (3 tests):** Required fields, positive bounds, unique IDs.

**Confidence Scoring (3 tests):** a11y ≥0.7, native_api ≥0.85, vision ≤0.85.

**Source Attribution (4 tests):** Editor → a11y, SAP → native_api, vision-enriched → mixed, vision ID prefix.

**Vision Fallback (4 tests):** Sparse context < 3 actionable, enriched ≥ 3, realistic bounds (≥50px wide, ≥20px tall), buttons have labels.

**Context Feed (5 tests):** Confidence mapping, chronological order, 1000-entry cap, empty → "paused", medium level for 0.7–0.9.

**Context Structure (5 tests):** Filter by type, lookup by ID, lookup by label, bounds-based search, recent timestamp.

### live-view (15 browser tests — requires Chromium)

**HTTP (3 tests):** Serves HTML with title, control buttons visible, "Connected" status.

**Streaming (3 tests):** PNG frames in browser, PNG over raw WebSocket (≥3 frames with magic bytes), context JSON over WebSocket.

**Controls (3 tests):** Pause → "paused" intent, Stop → "stopped" intent, Take Over → "takeover" intent.

**Multi-Client (1 test):** Two clients both receive ≥2 frames.

**Feed (2 tests):** Context entries appear with app name, intent entries have .intent styling.

**Lifecycle (3 tests):** stop() closes connections, works without callbacks, broadcastContext without capture.

---

## Test Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    E2E (Playwright)                       │
│  agent-engine · recorder · context-pipeline · live-view  │
├──────────────────────────────────────────────────────────┤
│              TypeScript Unit (vitest)                     │
│  engine · action-executor · context-assembly · queue     │
│  transcript · post-run · workflow-io · types             │
│  recorder · context-feed · server · registry             │
├──────────────────────────────────────────────────────────┤
│                 Rust Unit (cargo test)                    │
│  cel-accessibility · cel-context · cel-display           │
│  cel-input · cel-llm · cel-network · cel-vision          │
│  cel-store · cel-napi · adapters (excel, sap, bloomberg) │
└──────────────────────────────────────────────────────────┘
```

### Mock Contexts (e2e/fixtures/mock-context.ts)

| Fixture | Simulates | Elements | Source |
|---------|-----------|----------|--------|
| `editorContext()` | VS Code with file open | 10 (menus, buttons, editor, sidebar, terminal) | accessibility_tree |
| `browserContext()` | Firefox with login form | 11 (nav, URL bar, links, inputs, button, checkbox) | accessibility_tree |
| `sapContext()` | SAP Easy Access | 6 (menu, tcode input, execute button, tree, status) | native_api |
| `sparseContext()` | Legacy app, minimal a11y | 1 (title text only) | accessibility_tree |
| `visionEnrichedContext()` | Legacy app after vision fallback | 5 (1 a11y + 4 vision buttons/inputs) | mixed |
| `emptyContext()` | No app detected | 0 | — |

### Test Workflows

| Fixture | Steps | Purpose |
|---------|------:|---------|
| `loginWorkflow()` | 5 | Happy path: click username, type, click password, type, click login |
| `multiStepWorkflow()` | 4 | SAP transaction: click tcode, type VA01, execute, wait |
| `failingWorkflow()` | 3 | Failure path: step 1 succeeds, step 2 targets nonexistent element |
