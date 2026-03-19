# API Reference

CEL exposes its functionality at three levels: the MCP server (for AI agents), the TypeScript library (for custom agents), and the Rust core (for low-level integration).

## MCP Tools

See [mcp-server.md](mcp-server.md) for usage examples with each tool.

### cel_context

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mode` | `"full" \| "windows" \| "monitors" \| "make_reference"` | `"full"` | What to return |
| `element_id` | `string` | — | Element ID (required for `make_reference` mode) |
| `filter.element_types` | `string[]` | — | Only include these element types |
| `filter.min_confidence` | `number` | — | Minimum confidence (0.0-1.0) |

### cel_action

**Single action:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `"click" \| "right_click" \| "double_click" \| "type" \| "key_press" \| "key_combo" \| "scroll" \| "mouse_move"` | Yes | Action type |
| `x`, `y` | `number` | For click/move (unless `target_ref`) | Screen coordinates |
| `target_ref` | `ContextReference` | No | Element reference (alternative to coordinates) |
| `text` | `string` | For `type` | Text to type |
| `key` | `string` | For `key_press` | Key name (Enter, Tab, Escape, etc.) |
| `keys` | `string[]` | For `key_combo` | Key names (["Ctrl", "C"]) |
| `dx`, `dy` | `number` | For `scroll` | Scroll amounts |

**Batch actions:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `actions` | `Action[]` (1-10) | Array of single actions |
| `delay_between_ms` | `number` (default: 100) | Delay between actions |

### cel_observe

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mode` | `"snapshot" \| "wait_for_element" \| "wait_for_idle"` | — | Observation mode |
| `element_type` | `string` | — | (wait_for_element) Required element type |
| `label_contains` | `string` | — | (wait_for_element) Label substring match |
| `timeout_ms` | `number` | 10000 | Max wait time |
| `poll_interval_ms` | `number` | 500 | Poll interval |

### cel_knowledge

| Mode | Parameters | Description |
|------|------------|-------------|
| `search` | `query`, `workflow_scope?`, `limit` | Full-text search |
| `store` | `content`, `source`, `workflow_scope?`, `tags?` | Store a fact |
| `history` | `limit` | Recent workflow runs |
| `memory` | `workflow_name`, `content?` | Get/set working memory |

## TypeScript API (@cellar/agent)

### Cel Class

```typescript
import { Cel } from "@cellar/agent";
const cel = new Cel(dbPath?: string); // default: ~/.cellar/cel-store.db
```

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `isNativeAvailable` | `boolean` | Whether the Rust native module is loaded |

#### Context

| Method | Returns | Description |
|--------|---------|-------------|
| `getContext()` | `ScreenContext` | Unified screen context with all elements |
| `captureScreen()` | `Buffer` | PNG screenshot buffer |
| `listMonitors()` | `MonitorInfo[]` | Available monitors |
| `listWindows()` | `WindowInfo[]` | Visible windows |

#### Input Actions

| Method | Parameters | Description |
|--------|-----------|-------------|
| `click(x, y)` | `number, number` | Left-click at coordinates |
| `rightClick(x, y)` | `number, number` | Right-click |
| `doubleClick(x, y)` | `number, number` | Double-click |
| `mouseMove(x, y)` | `number, number` | Move mouse cursor |
| `typeText(text)` | `string` | Type text via unicode input |
| `keyPress(key)` | `string` | Press a key (Enter, Tab, etc.) |
| `keyCombo(keys)` | `string[]` | Press key combination (["Ctrl", "C"]) |
| `scroll(dx, dy)` | `number, number` | Scroll (positive = down/right) |

#### Context References

| Method | Returns | Description |
|--------|---------|-------------|
| `makeReference(element, screenWidth?, screenHeight?)` | `ContextReference` | Create a stable reference from an element |
| `resolveReference(context, ref)` | `ContextElement \| null` | Find an element matching a reference |

#### Knowledge Store

| Method | Returns | Description |
|--------|---------|-------------|
| `queryKnowledge(query)` | `KnowledgeFact[]` | Query knowledge facts |
| `addKnowledge(content, source)` | `number` | Add a fact, returns ID |
| `searchKnowledge(query, scope?, limit?)` | `ScoredKnowledgeRecord[]` | FTS5 full-text search |
| `addScopedKnowledge(content, source, scope?, tags?)` | `number` | Add scoped fact |

#### Working Memory

| Method | Returns | Description |
|--------|---------|-------------|
| `getWorkingMemory(workflowName)` | `string` | Get scratchpad content |
| `updateWorkingMemory(workflowName, content)` | `void` | Update scratchpad |

#### Observations

| Method | Returns | Description |
|--------|---------|-------------|
| `addObservation(workflowName, content, priority, sourceRunIds)` | `number` | Add observation from runs |
| `getObservations(workflowName, limit?)` | `ObservationRecord[]` | Get active observations |

#### Run Tracking

| Method | Returns | Description |
|--------|---------|-------------|
| `startRun(workflowName, stepsTotal)` | `number` | Start tracking, returns run ID |
| `finishRun(runId, status)` | `void` | Finish a run |
| `logStep(runId, stepIndex, stepId, action, success, confidence, snapshot?, error?)` | `number` | Log step result |
| `getRunHistory(limit?)` | `RunRecord[]` | Recent runs |
| `getStepResults(runId)` | `StepRecord[]` | Steps for a run |

#### Planner

| Method | Returns | Description |
|--------|---------|-------------|
| `planStep(goal, context, history?)` | `Promise<PlannedStep>` | LLM-driven step planning |

## Core Types

### ScreenContext

```typescript
interface ScreenContext {
  app: string;              // Foreground application name
  window: string;           // Active window title
  elements: ContextElement[]; // UI elements (sorted by confidence, highest first)
  network_events?: NetworkEvent[];
  timestamp_ms: number;
}
```

### ContextElement

```typescript
interface ContextElement {
  id: string;               // Unique identifier (ephemeral per snapshot)
  label?: string;           // Human-readable label
  description?: string;     // Tooltip / secondary label
  element_type: string;     // button, input, text, link, checkbox, etc.
  value?: string;           // Current value (for inputs, dropdowns)
  bounds?: Bounds;          // Screen-space bounding rectangle
  state: ElementState;      // Focused, enabled, visible, selected, expanded, checked
  parent_id?: string;       // Parent element ID (tree hierarchy)
  actions?: string[];       // Available actions: "click", "press", "activate"
  confidence: number;       // 0.0-1.0
  source: "accessibility_tree" | "native_api" | "vision" | "merged";
}
```

### ContextReference

```typescript
interface ContextReference {
  element_type: string;     // Must match exactly
  label?: string;           // Fuzzy matched (case-insensitive, partial)
  ancestor_path?: string[]; // Ancestry from root
  bounds_region?: BoundsRegion; // Coarse spatial region
  value_pattern?: string;   // Expected value
}

interface BoundsRegion {
  quadrant: string;         // "top-left", "center", "bottom-right", etc.
  relative_x: number;       // 0.0 (left) to 1.0 (right)
  relative_y: number;       // 0.0 (top) to 1.0 (bottom)
}
```

### Bounds

```typescript
interface Bounds {
  x: number;      // Left edge (pixels)
  y: number;      // Top edge (pixels)
  width: number;
  height: number;
}
```

### ElementState

```typescript
interface ElementState {
  focused: boolean;
  enabled: boolean;
  visible: boolean;
  selected: boolean;
  expanded?: boolean | null;  // For trees/accordions
  checked?: boolean | null;   // For checkboxes/radio buttons
}
```

### WorkflowAction

```typescript
type WorkflowAction =
  | { type: "click"; target: string; button?: "left" | "right" }
  | { type: "type"; target: string; text: string }
  | { type: "key"; key: string }
  | { type: "key_combo"; keys: string[] }
  | { type: "wait"; ms: number }
  | { type: "scroll"; dx: number; dy: number }
  | { type: "custom"; adapter: string; action: string; params: Record<string, unknown> };
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `CEL_LLM_PROVIDER` | LLM provider for vision/planner | `openai`, `anthropic`, `gemini`, `compatible` |
| `CEL_LLM_API_KEY` | API key for the LLM provider | `sk-...` |
| `CEL_LLM_MODEL` | Model name | `gpt-4o`, `claude-sonnet-4-6` |
| `CEL_LLM_ENDPOINT` | Custom endpoint (for compatible providers) | `http://localhost:11434/v1` |
