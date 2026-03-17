# cellar

Open source desktop agent runtime — powered by CEL (Context Execution Layer).

> Show Dilipod how to do something once. It does it forever, on its own, while you watch.

## What is cellar?

Cellar provides the runtime layer that makes desktop automation reliable. It works with **any** desktop application — not just browsers — by combining multiple context sources into a unified API that agents can act on with confidence.

### The problem

Browser automation is the easy case — the DOM gives you structured data for free. Native desktop apps (SAP, Bloomberg, Excel, legacy ERPs) have no equivalent. Accessibility APIs exist but are inconsistently implemented. Vision-only approaches are slow and fragile.

### The solution: CEL

CEL (Context Execution Layer) is a controlled execution environment with five simultaneous context streams:

| Stream | What it provides |
|---|---|
| **Vision** | Continuous screen capture → vision model when needed |
| **Accessibility tree** | UIA (Windows) / AXUIElement (macOS) structured element tree |
| **Native API bridge** | App-specific adapters (SAP Scripting, Excel COM, BLPAPI) |
| **Input layer** | All mouse/keyboard events — injected, intercepted, logged, replayable |
| **Network layer** | Traffic monitoring for web-based apps and state change detection |

All streams merge into a **unified context API**. The agent calls `getContext()` and gets a structured world model with confidence scores — regardless of which source provided the data.

## Architecture

```
cellar/
  cel/                  ← CEL core (Rust)
    cel-display/        ← screen capture
    cel-input/          ← input injection & interception
    cel-accessibility/  ← UIA + AXUIElement bridge
    cel-vision/         ← vision model integration
    cel-network/        ← traffic monitoring
    cel-context/        ← unified context API
    cel-store/          ← embedded SQLite (memory & knowledge)
    cel-napi/           ← Node.js native bindings
  adapters/             ← app-specific adapters
  agent/                ← workflow execution engine (TypeScript)
  recorder/             ← training: passive observation + explicit record
  live-view/            ← screen stream + context feed server
  registry/             ← community workflow & adapter registry
  cli/                  ← `dilipod` CLI
  box/                  ← dedicated hardware setup
```

## Quick Start

### Prerequisites

- Rust 1.75+
- Node.js 20+
- pnpm 9+

### Build

```bash
# Build everything
make build

# Or separately
make build-rust    # cargo build --workspace
make build-ts      # pnpm install && pnpm build
```

### CLI

```bash
dilipod train              # Enter training mode
dilipod run <workflow>     # Execute a workflow
dilipod status             # Show queue and CEL health
dilipod live-view          # Start local live view
dilipod adapter install <name>
dilipod workflow export <name>
```

## Dilipod Box

The Box is cellar pre-installed on dedicated hardware. Same open source runtime, always-on, fully isolated. Ideal for trading ops, regulated environments, and 24/7 automation.

- Always on — starts on boot, runs headlessly
- Air-gap capable — no internet required
- IT-approvable — compliance can audit, data stays on-premise

## Platform Support

| Platform | Status |
|---|---|
| Windows | Supported (UI Automation, Win32, DXGI) |
| macOS | Supported (AXUIElement, CGEvent, ScreenCaptureKit) |
| Linux | Development/CI only |

## License

This project uses a split license model:

- **`cel/` (CEL core runtime):** [Apache License 2.0](cel/LICENSE) — fully open source. Use, modify, distribute freely.
- **Everything else** (agent, cli, box, live-view, recorder, registry): [Business Source License 1.1](LICENSE) — self-host and modify freely; offering as a managed service requires a commercial license. Converts to Apache 2.0 after 4 years.
- **Adapters:** Community-contributed adapters are MIT licensed.

## Links

- [Dilipod](https://dilipod.com)
- [Documentation](https://docs.dilipod.com)
- [Community Registry](https://registry.dilipod.com)
