# cellar

Open source desktop agent runtime — powered by CEL (Context Execution Layer).

> **Status: Early development (prototype).** The core architecture is functional on Linux. macOS and Windows support, production-hardening, and documentation are in progress. Contributions and feedback welcome.

## The Problem

The browser has the DOM — a structured, queryable map of everything on screen. Any tool (screen reader, test framework, AI agent) can ask "what is on this page?" and get a structured answer.

Desktop applications have no equivalent. Accessibility APIs exist but are inconsistently implemented. Vision (screenshots) works everywhere but is slow and imprecise. No single source is reliable across all applications, and there is no open standard that combines them.

Every project that needs to understand a desktop screen rebuilds the same brittle solution from scratch.

## The Solution: CEL

CEL (Context Execution Layer) solves this once, for everyone. It fuses multiple context streams into a single unified API with per-element confidence scoring:

| Stream | What it provides |
|---|---|
| **Vision** | Screen capture + vision model analysis |
| **Accessibility tree** | Platform accessibility APIs (AT-SPI2 on Linux, AXUIElement on macOS, UIA on Windows) |
| **Native API bridge** | App-specific adapters (Excel COM, SAP Scripting, etc.) |
| **Input layer** | Mouse/keyboard events — injected, intercepted, logged, replayable |
| **Network layer** | Traffic monitoring for state change detection |

The agent calls `getContext()` and gets a structured world model with confidence scores — regardless of which source provided the data. A fallback chain selects the best available source automatically.

## Current State

**What works:**
- Unified context API with multi-source fusion and confidence scoring
- Linux accessibility bridge (AT-SPI2)
- Screen capture and input injection
- Vision provider integration (OpenAI, Gemini, Anthropic, custom endpoints)
- Embedded storage with semantic search (SQLite + FTS5)
- Workflow execution engine
- Training/recording system
- Live view server
- CLI scaffolding
- napi-rs bridge (Rust ↔ Node.js)

**In progress:**
- macOS accessibility bridge (AXUIElement)
- Production confidence calibration
- Portable context maps for community sharing
- First production adapter (Excel COM)
- Documentation and developer guides

## Architecture

```
cellar/
  cel/                  ← CEL core runtime (Rust, Apache 2.0)
    cel-display/        ← screen capture
    cel-input/          ← input injection & interception
    cel-accessibility/  ← accessibility bridge (AT-SPI2, AXUIElement planned)
    cel-vision/         ← vision model integration
    cel-network/        ← traffic monitoring
    cel-context/        ← unified context API + multi-source fusion
    cel-store/          ← embedded SQLite (memory, knowledge, context maps)
    cel-llm/            ← LLM provider abstraction
    cel-napi/           ← Node.js native bindings (napi-rs)
  adapters/             ← app-specific adapters (stubs)
  agent/                ← workflow execution engine (TypeScript)
  recorder/             ← training: passive observation + explicit record
  live-view/            ← screen stream + context feed server
  registry/             ← community workflow & adapter registry (planned)
  cli/                  ← `dilipod` CLI
  box/                  ← dedicated hardware setup
```

## Getting Started

### Prerequisites

- Rust 1.75+
- Node.js 20+
- pnpm 9+
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

### CLI (in development)

```bash
dilipod capture            # Capture current screen context
dilipod context            # Show unified context with confidence scores
dilipod train              # Enter training mode
dilipod run <workflow>     # Execute a workflow
```

## Contributing

See [DEVELOPMENT.md](DEVELOPMENT.md) for build instructions, project structure, and conventions.

We welcome contributions — especially:
- Accessibility bridge improvements
- New application adapters
- Test coverage for platform-specific code
- Documentation

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
