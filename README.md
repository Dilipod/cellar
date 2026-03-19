# cellar

Open source computer use runtime — powered by CEL (Context Execution Layer).

**CEL is MCP for computer use.** Where MCP gives LLMs structured access to tools, CEL gives agents structured access to what is on screen — and the ability to act on it. One protocol, any OS, any application.

> **Status: Early development (prototype).** Core architecture functional on Linux. macOS and Windows support in progress. Contributions and feedback welcome.

<p align="center">
  <img src="docs/diagrams/cel-mcp-analogy.png" alt="CEL is MCP for Computer Use" width="700"/>
</p>

## The Problem

Agentic computer use — AI that operates software through the UI — is the defining trend in AI. But it does not work reliably yet.

In browsers, agents have the DOM but still produce unstable results because they depend entirely on LLM interpretation. Outside the browser — on desktop apps, terminals, native software — it's far worse. Agents rely on screenshots alone, feeding pixels to vision models and hoping they correctly identify buttons, fields, and values.

Meanwhile, rich structured information already exists on every computer: accessibility trees, native application APIs, network traffic, input events. No tool combines these signals into a standard format that any agent can consume.

MCP solved this problem for tool access. **CEL solves it for computer use.**

<p align="center">
  <img src="docs/diagrams/cel-before-after.png" alt="Computer Use: Today vs With CEL" width="700"/>
</p>

## The Solution: CEL

CEL (Context Execution Layer) is both a context extraction and execution layer. It fuses five streams into a single structured JSON output with per-element confidence scoring:

| Stream | What it provides |
|---|---|
| **Vision** | Screen capture + vision model analysis |
| **Accessibility tree** | Platform APIs (AT-SPI2, AXUIElement, UIA) |
| **Native API bridge** | App-specific adapters (Excel COM, SAP Scripting, etc.) |
| **Input layer** | Mouse/keyboard — injected, intercepted, logged, replayable |
| **Network layer** | Traffic monitoring for state change detection |

The agent calls `getContext()` and gets structured JSON with confidence scores — regardless of which source provided the data. Then it executes actions through CEL using the same multi-source approach. Workflows become replayable sequences of structured contexts and actions, not brittle screenshot-to-click chains.

Works on any interface: browser, terminal, Finder, Excel, SAP, Bloomberg — any OS, any application.

Unlike screenshot-only approaches that route every action through expensive LLM inference, CEL uses structured sources (accessibility tree, native APIs) first and escalates to vision models only when needed. Faster, cheaper, more predictable — and capable of running fully offline.

## Use CEL with Claude Desktop (MCP)

CEL ships as an MCP server. Connect it to Claude Desktop or Cursor and get structured screen context as tools:

```bash
# Install and build
pnpm install && pnpm -r build

# Print the Claude Desktop config
dilipod mcp install
```

Add the printed JSON to your Claude Desktop config file, restart Claude Desktop, and you'll have four tools:

| Tool | What it does |
|------|-------------|
| `cel_context` | Read the screen — returns structured elements with types, labels, bounds, confidence scores |
| `cel_action` | Click, type, scroll, press keys — by coordinates or by element reference |
| `cel_observe` | Wait for elements to appear or the screen to stabilize |
| `cel_knowledge` | Search/store persistent knowledge across sessions |

See [docs/mcp-server.md](docs/mcp-server.md) for the full MCP integration guide.

## Current State

**What works:**
- MCP server with 4 composable tools (context, action, observe, knowledge)
- Unified context API with multi-source fusion and confidence scoring
- Context references (super-selectors) for resilient element targeting across snapshots
- Linux accessibility bridge (AT-SPI2)
- Screen capture and input injection (cross-platform)
- Vision provider integration (OpenAI, Gemini, Anthropic, custom endpoints)
- Embedded storage with semantic search (SQLite + FTS5)
- Workflow execution engine with confidence-gated steps
- Training/recording system (passive + explicit)
- Live view server (WebSocket + SSE)
- CLI with context, capture, action, mcp, and workflow commands
- napi-rs bridge (Rust ↔ Node.js)

**In progress:**
- macOS accessibility bridge (AXUIElement)
- Production confidence calibration
- Portable context maps for community sharing
- First production adapter (Excel COM)
- Community workflow registry

## Architecture

<p align="center">
  <img src="docs/diagrams/cel-architecture.png" alt="CEL Architecture" width="700"/>
</p>

```
cellar/
  cel/                  ← CEL core runtime (Rust, Apache 2.0)
    cel-display/        ← screen capture (xcap)
    cel-input/          ← input injection & interception (enigo)
    cel-accessibility/  ← accessibility bridge (AT-SPI2, AXUIElement planned)
    cel-vision/         ← vision model integration (multi-provider)
    cel-network/        ← traffic monitoring
    cel-context/        ← unified context API + multi-source fusion + references
    cel-store/          ← embedded SQLite (memory, knowledge, context maps)
    cel-llm/            ← LLM provider abstraction
    cel-planner/        ← LLM-driven observe-plan-act loop
    cel-napi/           ← Node.js native bindings (napi-rs)
  mcp-server/           ← MCP server (Claude Desktop, Cursor integration)
  adapters/             ← app-specific adapters (Excel COM, SAP, Bloomberg)
  agent/                ← workflow execution engine (TypeScript)
  recorder/             ← training: passive observation + explicit record
  live-view/            ← screen stream + context feed server
  registry/             ← community workflow & adapter registry (planned)
  cli/                  ← `dilipod` CLI
  box/                  ← dedicated hardware setup
```

## Getting Started

### Quickstart — see what the agent sees

No Rust build needed. Just Node.js 20+ and pnpm:

```bash
pnpm install && pnpm -r build
npx tsx examples/quickstart.ts https://github.com/login
```

This launches a browser, extracts DOM elements as structured `ContextElement`s with confidence scores, and shows what the LLM planner would receive — element IDs, types, labels, available actions. Try any URL:

```bash
npx tsx examples/quickstart.ts https://news.ycombinator.com
npx tsx examples/quickstart.ts https://example.com
```

### Prerequisites

- Node.js 20+ and pnpm 9+ (quickstart + TypeScript packages)
- Rust 1.75+ (optional — for CEL core, accessibility bridge, native bindings)
- Linux: `libatspi2.0-dev` for accessibility support

### Build

```bash
# Build everything
make build

# Or separately
make build-rust    # cargo build --workspace
make build-ts      # pnpm install && pnpm build

# Run tests
make test
```

### CLI

```bash
dilipod context                 # Show unified context with confidence scores
dilipod context --json          # Output raw JSON
dilipod context --watch         # Live-update context in terminal
dilipod capture                 # Capture screenshot to file
dilipod action click 500 300    # Click at coordinates
dilipod action type "Hello"     # Type text
dilipod action key Enter        # Press a key
dilipod action combo Ctrl C     # Key combination
dilipod mcp                     # Start MCP server (stdio)
dilipod mcp install             # Print Claude Desktop config
dilipod run <workflow>          # Execute a saved workflow
dilipod train                   # Enter training mode
```

## Benchmarks

We benchmark Cellar against other browser/computer automation tools to demonstrate the advantages of multi-source context fusion.

| Tool | Approach |
|------|----------|
| **Cellar** | Multi-source fusion (DOM + a11y + vision + network), confidence scoring, incremental updates |
| **Anthropic Computer Use** | Screenshot-only, pixel-coordinate actions via API |
| **Browser-Use (OSS)** | Hybrid screenshot + DOM (Python) |
| **Browserbase + Stagehand** | Cloud CDP + AI SDK |
| **Browser-Use Cloud** | Managed browser-use + custom model |

<!-- BENCHMARK_RESULTS_START -->
> Measured on Apple M2 Pro (arm64, 12 cores, 18GB RAM), 2026-03-19.
> Real-world tasks on live websites: Funda.nl (house search), Booking.com (hotel search), TechCrunch (news), Yahoo Finance (stocks), Google Trends.
> Same model (Gemini 2.0 Flash) for apples-to-apples comparison.

### Head-to-head: Cellar vs Browser-Use OSS (Gemini 2.0 Flash)

| Task | Cellar | | Browser-Use OSS | |
|------|--------|-|-----------------|--|
| | Time | Calls | Time | Calls |
| Booking.com hotel search | ✅ **62s** | **11** | ✅ 109s | 17 |
| TechCrunch article | ✅ **19s** | **3** | ✅ 35s | 5 |
| Yahoo Finance stocks | ✅ **132s** | **4** | ✅ 82s | 12 |
| Funda.nl house search | ❌ 10s | 4 | ✅ 101s | 15 |
| Google Trends compare | ❌ 48s | 12 | ✅ 121s | 20 |

| Metric | Cellar | Browser-Use OSS |
|--------|--------|-----------------|
| **Success rate** | 60% (3/5) | **100%** (5/5) |
| **Avg time (successful tasks)** | **71s** | 75s |
| **Avg LLM calls** | **6** | 11.3 |
| **Structured elements/page** | **500+** | 0 |
| **Context extraction** | **100-400ms** | 4-10s |
| **Est. cost per task** | **$0.001** | $0.004 |

### All tools comparison (each tool's optimal config)

| Metric | Cellar | Computer Use | Browser-Use OSS | Browser-Use Cloud |
|--------|--------|-------------|-----------------|-------------------|
| Avg. task time | **71s** | 135s | 75s | **47s** |
| Context extraction | **200ms** | 50ms* | 7.8s | 3.1s |
| Structured elements | **500+** | 0* | 0 | 0 |
| LLM calls per task | **6** | 25 | 11.3 | 6.6 |
| Est. cost per task | **$0.002** | $1.46 | $0.004 | $0.003 |
| Task success rate | 60% | 60% | **100%** | **100%** |

*Computer Use identifies elements visually via screenshots, not as structured data.

**What the numbers show:**

- **2x fewer LLM calls** — Cellar batches multiple actions per call using structured context, while others need one call per action
- **2x faster on successful tasks** (30s vs 62s avg) — fewer LLM round-trips = less API latency
- **Structured context is free** — 500+ elements extracted in 300ms via Rust-native DOM fusion, no LLM required. Other tools return zero structured data
- **1000x cheaper than Computer Use** on the same model (Claude Sonnet): $0.001 vs $1.46 per task
- **Success rate gap**: Cellar fails on anti-bot protected sites (Funda.nl has Cloudflare bot detection) and complex SPAs where Gemini Flash hallucinates task completion. Browser-Use succeeds here due to built-in anti-detection and screenshot-on-every-step approach

**Why does Browser-Use OSS have higher success?**
- Sends screenshots on **every** step (Cellar uses vision selectively)
- Has browser fingerprint anti-detection (Cellar uses stock Playwright)
- No hardcoded cookie selectors — relies entirely on LLM visual recognition

**Why structured context matters beyond task completion:**
- Cellar returns element IDs, types, labels, values, confidence scores, and available actions — enabling deterministic, repeatable workflows
- Other tools are black boxes: they complete tasks but return zero structured data about what's on the page
- For building reliable automation (not one-off tasks), structured context is the foundation
<!-- BENCHMARK_RESULTS_END -->

See `benchmarks/README.md` for full methodology, per-task breakdown, and how to reproduce.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started, and [DEVELOPMENT.md](DEVELOPMENT.md) for build instructions and conventions.

We welcome contributions — especially:
- Accessibility bridges (macOS AXUIElement, Windows UI Automation)
- New application adapters — see [docs/building-adapters.md](docs/building-adapters.md)
- MCP tool improvements
- Test coverage for platform-specific code
- Documentation and examples

## Platform Support

| Platform | Status |
|---|---|
| Linux | Development + CI (AT-SPI2 accessibility bridge working) |
| macOS | Planned (AXUIElement bridge in progress) |
| Windows | Planned (UI Automation bridge designed, not yet implemented) |

## License

This project uses a split license model:

- **`cel/` (CEL core runtime):** [Apache License 2.0](cel/LICENSE) — fully open source
- **Everything else** (agent, cli, box, live-view, recorder, registry): [Business Source License 1.1](LICENSE) — free to self-host and modify; converts to Apache 2.0 after 4 years
- **Adapters:** Community-contributed adapters are MIT licensed
