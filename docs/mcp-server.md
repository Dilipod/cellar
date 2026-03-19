# CEL MCP Server

CEL exposes its capabilities as an [MCP](https://modelcontextprotocol.io/) server, making it instantly available to Claude Desktop, Cursor, and any MCP-compatible client.

## Setup

### Claude Desktop

```bash
# Build everything
pnpm install && pnpm -r build

# Get the config snippet
dilipod mcp install
```

This prints JSON like:

```json
{
  "mcpServers": {
    "cel": {
      "command": "npx",
      "args": ["@cellar/cli", "mcp"]
    }
  }
}
```

Add it to your Claude Desktop config:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

Restart Claude Desktop. You should see CEL's four tools in the tools menu.

### Manual / Debugging

Run the MCP server directly to test:

```bash
# Stdio mode (what Claude Desktop uses)
dilipod mcp

# Or via npx
npx @cellar/mcp-server
```

The server communicates over stdin/stdout using JSON-RPC. Logs go to stderr.

## Tools

### cel_context — Read the Screen

Returns the current screen state as structured JSON. Every UI element includes its type, label, bounds, state, available actions, and a confidence score.

**Modes:**

| Mode | What it returns |
|------|----------------|
| `full` (default) | Complete `ScreenContext` with all detected elements |
| `windows` | List of visible windows (id, title, app, bounds) |
| `monitors` | List of monitors (id, resolution, position) |
| `make_reference` | Create a stable reference from an element ID |

**Example — get full context:**

```json
{
  "mode": "full"
}
```

**Example — filter to just buttons and links above 70% confidence:**

```json
{
  "mode": "full",
  "filter": {
    "element_types": ["button", "link"],
    "min_confidence": 0.7
  }
}
```

**Example — create a reference for later use:**

```json
{
  "mode": "make_reference",
  "element_id": "a11y:0x12345"
}
```

**What comes back (ScreenContext):**

```json
{
  "app": "Firefox",
  "window": "GitHub - Login",
  "elements": [
    {
      "id": "a11y:0x12345",
      "label": "Sign in",
      "element_type": "button",
      "bounds": { "x": 520, "y": 400, "width": 120, "height": 40 },
      "state": { "focused": false, "enabled": true, "visible": true, "selected": false },
      "actions": ["click", "activate"],
      "confidence": 0.90,
      "source": "accessibility_tree"
    },
    {
      "id": "a11y:0x12346",
      "label": "Username or email",
      "element_type": "input",
      "value": "",
      "bounds": { "x": 400, "y": 300, "width": 260, "height": 36 },
      "state": { "focused": true, "enabled": true, "visible": true, "selected": false },
      "actions": ["click", "activate"],
      "confidence": 0.85,
      "source": "accessibility_tree"
    }
  ],
  "network_events": [],
  "timestamp_ms": 1710777600000
}
```

### cel_action — Execute Actions

Click, type, scroll, and press keys. Actions can target coordinates directly or use element references.

**Single action with coordinates:**

```json
{
  "action": "click",
  "x": 520,
  "y": 420
}
```

**Single action with element reference (more resilient):**

```json
{
  "action": "click",
  "target_ref": {
    "element_type": "button",
    "label": "Sign in"
  }
}
```

When `target_ref` is provided, CEL reads the current context, resolves the reference to find the matching element, and clicks its center. This survives layout changes that would break fixed coordinates.

**Type text:**

```json
{
  "action": "type",
  "text": "my-username"
}
```

**Key press / combo:**

```json
{ "action": "key_press", "key": "Enter" }
{ "action": "key_combo", "keys": ["Ctrl", "A"] }
```

**Batch actions (fill a form in one call):**

```json
{
  "actions": [
    { "action": "click", "x": 400, "y": 300 },
    { "action": "type", "text": "my-username" },
    { "action": "key_press", "key": "Tab" },
    { "action": "type", "text": "my-password" },
    { "action": "key_press", "key": "Enter" }
  ],
  "delay_between_ms": 100
}
```

### cel_observe — Wait for State Changes

Instead of polling `cel_context` in a loop, use `cel_observe` to wait for specific conditions.

**Wait for an element to appear:**

```json
{
  "mode": "wait_for_element",
  "element_type": "button",
  "label_contains": "Submit",
  "timeout_ms": 10000
}
```

Returns the matching element as soon as it appears, or an error after the timeout.

**Wait for the screen to stabilize:**

```json
{
  "mode": "wait_for_idle",
  "timeout_ms": 5000
}
```

Polls the context twice. If the elements haven't changed between polls, returns the stable context. Useful after navigation or form submission when you need to wait for the page to settle.

**Take a snapshot (same as cel_context full, but semantically distinct):**

```json
{
  "mode": "snapshot"
}
```

### cel_knowledge — Persistent Memory

Search and store knowledge that persists across sessions. Uses SQLite with FTS5 full-text search.

**Search:**

```json
{
  "mode": "search",
  "query": "login credentials format",
  "limit": 5
}
```

**Store a fact:**

```json
{
  "mode": "store",
  "content": "The SAP login page requires employee ID in field 'MANDT'",
  "source": "user-observation",
  "tags": "sap,login"
}
```

**Get/set working memory (per-workflow scratchpad):**

```json
{
  "mode": "memory",
  "workflow_name": "daily-report",
  "content": "Last processed row: 42"
}
```

**View run history:**

```json
{
  "mode": "history",
  "limit": 10
}
```

## Context References

Element IDs are ephemeral — they change between context snapshots. Context references solve this by identifying elements through multiple signals that survive across snapshots:

1. **Element type** (button, input, etc.) — must match exactly
2. **Label** — fuzzy matched (case-insensitive, partial match)
3. **Bounds region** — coarse spatial position (e.g., "top-right"), not exact pixels
4. **Value pattern** — for inputs, the expected content

**Workflow:**

1. Get context, find the element you want
2. Create a reference: `cel_context` with `mode: "make_reference"` and the element's `id`
3. Use the reference in actions: `cel_action` with `target_ref` instead of `x`/`y`

References are more resilient than coordinates because they combine multiple signals. If the element moves 10px due to a layout shift, the reference still finds it.

## How Context Fusion Works

When you call `cel_context`, CEL merges data from multiple sources with a priority hierarchy:

1. **Native API** (highest priority) — deterministic, precise (when an adapter is available)
2. **Accessibility tree** — structured, reliable on modern apps
3. **Vision** (fallback) — triggered only when the accessibility tree yields fewer than 5 actionable elements
4. **Network** (supplementary) — provides connection state signals

Each element gets a confidence score (0.0-1.0) based on:

| Factor | Points |
|--------|--------|
| Element exists in source | +0.60 |
| Has a label or value | +0.10 |
| Has valid bounds (non-zero area) | +0.10 |
| Visible and enabled | +0.05 |
| Actionable type (button, input, link) | +0.05 |
| Has declared actions (from accessibility) | +0.05 |
| Cross-source confirmation (a11y + vision agree) | +0.05 |

**Max score: ~0.95** (when multiple sources confirm the same element).

The agent can use confidence to decide how to act:
- 0.9+ — act immediately
- 0.7-0.9 — act and log for review
- 0.5-0.7 — act cautiously (verify after action)
- Below 0.5 — pause and ask the user

## Programmatic Usage (Node.js)

If you're building your own agent instead of using MCP:

```typescript
import { Cel } from "@cellar/agent";

const cel = new Cel();

// Read the screen
const ctx = cel.getContext();
console.log(`App: ${ctx.app}, Elements: ${ctx.elements.length}`);

// Find a button
const btn = ctx.elements.find(
  (el) => el.element_type === "button" && el.label?.includes("Submit")
);

// Click it
if (btn?.bounds) {
  const x = btn.bounds.x + btn.bounds.width / 2;
  const y = btn.bounds.y + btn.bounds.height / 2;
  cel.click(x, y);
}

// Or use references
const ref = cel.makeReference(btn!);
// ... later, in a new context snapshot:
const newCtx = cel.getContext();
const resolved = cel.resolveReference(newCtx, ref);
```

### Starting the MCP server programmatically

```typescript
import { createCelMcpServer } from "@cellar/mcp-server/server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = createCelMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
```
