# CEL Quality Improvement Plan

## Overview

Address the 7 high/medium-priority gaps identified in the audit, plus 4 remaining gaps from the deeper analysis. Changes are ordered by severity and dependency.

---

## Phase 1: Critical — NAPI Bridge Completeness

### 1.1 Wire up network monitor in `cel-napi` `get_context()`

**File:** `cel/cel-napi/src/lib.rs`

**Current:**
```rust
let a11y = cel_accessibility::create_tree();
let display = cel_display::create_capture();
let mut merger = cel_context::ContextMerger::with_display(a11y, display);
```

**Change to:**
```rust
let a11y = cel_accessibility::create_tree();
let display = cel_display::create_capture();
let network = cel_network::create_monitor();
let mut merger = cel_context::ContextMerger::with_all(a11y, display, network);
```

- `with_all()` already exists in merge.rs and accepts all three
- Add `cel-network` to cel-napi's Cargo.toml dependencies

### 1.2 Wire up vision provider in `cel-napi` `get_context()`

**After** creating the merger with `with_all()`, conditionally attach vision:
```rust
let merger = if let Ok(vision) = cel_vision::create_provider_from_env() {
    merger.with_vision(vision)
} else {
    merger
};
```

- Check if `cel_vision::create_provider_from_env()` exists; if not, add a factory function that reads `CEL_VISION_PROVIDER` env var
- Add `cel-vision` to cel-napi's Cargo.toml dependencies
- Vision is optional — no-op if env var not set

### 1.3 Wire up native API adapters (deferred/optional)

Native adapters require async and app-specific detection. For now, expose a separate NAPI function:
```rust
#[napi]
pub fn get_context_with_adapter(adapter_name: String) -> napi::Result<String>
```

This is lower priority since the existing adapters (Excel, SAP, Bloomberg, MetaTrader) need specific connection setup. Mark as future work unless user requests it.

---

## Phase 2: High — Fix `focused_element()` in linux.rs

### 2.1 Rewrite `focused_element()` to recursively search for STATE_FOCUSED

**File:** `cel/cel-accessibility/src/linux.rs` (lines 486-536)

**Current behavior:** Iterates AT-SPI2 registry children, returns the first app with a non-empty name. Does NOT check the STATE_FOCUSED bit.

**New implementation:**
1. Iterate registry children (apps) as before
2. For each app, build a shallow element tree (depth-limited to 3-4 levels)
3. Check each element's state bits for `STATE_FOCUSED` (bit 12: `bits & (1 << 12) != 0`)
4. Return the first element with STATE_FOCUSED set
5. Fall back to current behavior (first app with name) if no focused element found

**Key design decisions:**
- Depth limit of 4 is sufficient — focused elements are usually shallow (menu items, buttons, input fields)
- Element count limit of 50 for the focused search — we don't need the full tree
- Keep the existing fallback for apps that don't report focus properly

### 2.2 Add unit test for focused_element()

Add a test in `cel/cel-accessibility/src/linux.rs` that:
- Mocks a tree with multiple elements, one having STATE_FOCUSED
- Verifies `focused_element()` returns that specific element
- Tests fallback when no element has STATE_FOCUSED

---

## Phase 3: High — D-Bus Timeout Handling

### 3.1 Add timeout to D-Bus proxy calls

**File:** `cel/cel-accessibility/src/linux.rs`

zbus 5.x `blocking::Proxy` doesn't have a built-in per-call timeout. Options:

**Approach A (Recommended):** Use `zbus::blocking::proxy::Builder` with `.default_timeout()`:
```rust
let proxy = zbus::blocking::Proxy::builder(&self.conn)
    .destination(dest)?
    .path(path)?
    .interface("org.a11y.atspi.Accessible")?
    .default_timeout(std::time::Duration::from_secs(2))
    .build()?;
```

This sets a 2-second timeout on all method calls through that proxy. Apply to:
- `get_children()` (line 328)
- `get_name()` (line 160)
- `get_state()` (line 206)
- `get_bounds()` (line 260)
- `get_actions()` (line 293)
- `get_text()` (line 176)
- `build_element()` (line 357)

**Timeout values:**
- Tree building: 2s per element (aggregates, but MAX_ELEMENTS=500 bounds total)
- Focused element search: 1s per app (we check few apps)

### 3.2 Handle timeout errors gracefully

When a D-Bus call times out:
- `get_tree()`: Skip the timed-out app, continue with others
- `build_element()`: Skip timed-out children, return partial tree
- `focused_element()`: Skip timed-out app, try next
- Log a warning via `tracing::warn!`

---

## Phase 4: Medium — Make `state` non-optional on ContextElement

### 4.1 Change `state` from `Option<ElementState>` to `ElementState`

**Files:**
- `cel/cel-context/src/element.rs`: Change `pub state: Option<ElementState>` to `pub state: ElementState`
- Add `impl Default for ElementState` (all false, expanded/checked = None)

### 4.2 Update all code that constructs ContextElement

- `cel/cel-context/src/merge.rs`: Remove `Some()` wrappers around state
- Vision elements: Use `ElementState::default()` instead of `None`
- Tests: Update all element constructions

### 4.3 Update TypeScript types

**File:** `agent/src/types.ts`
- Change `state?: ElementState | null` to `state: ElementState`
- Remove null checks in `context-assembly.ts` (e.g., `e.state?.enabled` → `e.state.enabled`)

### 4.4 Update serde handling

Add `#[serde(default)]` to `state` field so old serialized data without state still deserializes (backwards compat).

---

## Phase 5: Medium — Improve context_snapshot.rs Example

### 5.1 Display missing fields

**File:** `cel/cel-context/examples/context_snapshot.rs`

Add display of:
- `description` (truncated, after label)
- `value` (truncated, after description)
- `actions` (comma-joined list, e.g., `actions=[click,press]`)

### 5.2 Add vision fallback indication

After printing element counts, add:
```
Vision fallback: YES (2 actionable < 5 threshold)
```
or
```
Vision fallback: NO (8 actionable >= 5 threshold)
```

---

## Phase 6: Medium — Add Confidence Formula Unit Tests

### 6.1 Add targeted tests for `calculate_confidence()`

**File:** `cel/cel-context/tests/integration.rs` (or new `confidence.rs`)

Tests to add:
1. **Bare minimum element** (no label, no bounds, no actions) → expect 0.60
2. **Element with label** → expect 0.70 (0.60 + 0.10)
3. **Element with label + bounds** → expect 0.80 (0.60 + 0.10 + 0.10)
4. **Element with label + bounds + visible/enabled** → expect 0.85
5. **Element with label + bounds + visible/enabled + actionable type** → expect 0.90
6. **Fully loaded element** (all bonuses) → expect 0.90 (capped)
7. **Vision-supplemented element** → expect capped at 0.95

### 6.2 Add state bit parsing test

**File:** `cel/cel-accessibility/tests/` (new `state_bits.rs` or in existing test file)

Test that constructs a known 64-bit state bitfield and verifies:
- Bit 12 set → `focused: true`
- Bit 17 set → `enabled: true`
- Bit 26 set → `visible: true`
- Bit 18 set → `selected: true`
- Bit 9 set → `expanded: Some(true)`
- Bit 7 set → `checked: Some(true)`
- All bits clear → all false/None

---

## Phase 7: Low — Improve Mock Contexts

### 7.1 Add parent_id to mock elements

**File:** `e2e/fixtures/mock-context.ts`

Update the `el()` helper to accept optional `parent_id` parameter. Populate realistic hierarchies:
- `editor-area` as parent of `tab-main`, `tab-settings`
- `menu-bar` as parent of `menu-file`, `menu-edit`
- `sidebar` as parent of `file-explorer`, `search`

### 7.2 Add actions to mock elements

Update mocks to include actions where appropriate:
- Buttons: `["click", "press"]`
- Links: `["jump"]`
- Inputs: `["activate", "set"]`
- Checkboxes: `["toggle"]`

### 7.3 Add formatContextSummary tests for new fields

**File:** `agent/tests/context-assembly.test.ts`

Add tests that verify:
- `withActions` count is correct when elements have actions
- Focused element display works
- Summary format is stable

---

## Dependency Graph

```
Phase 1.1 (network) ──┐
Phase 1.2 (vision) ───┤── can be done in parallel
Phase 2 (focused)  ───┤
Phase 3 (timeout)  ───┘

Phase 4 (state non-optional) ── depends on nothing, but touches many files
Phase 5 (snapshot example)   ── independent
Phase 6 (tests)              ── depends on Phases 2, 3, 4 being done
Phase 7 (mocks)              ── independent
```

## Estimated Scope

- **Phase 1**: ~50 lines changed in cel-napi, ~5 lines in Cargo.toml
- **Phase 2**: ~60 lines rewritten in linux.rs, ~40 lines of tests
- **Phase 3**: ~30 lines changed across linux.rs (proxy builder calls)
- **Phase 4**: ~80 lines changed across element.rs, merge.rs, types.ts, context-assembly.ts, tests
- **Phase 5**: ~20 lines added to context_snapshot.rs
- **Phase 6**: ~120 lines of new tests
- **Phase 7**: ~40 lines changed in mock-context.ts, ~30 lines of new TS tests
