# Cellar — Development Guide

## Project Structure

- **Rust workspace** at repo root (`Cargo.toml`) — all `cel/` and `adapters/` crates
- **TypeScript monorepo** via pnpm workspace — `agent/`, `recorder/`, `live-view/`, `registry/`, `cli/`
- Rust ↔ TypeScript bridge via **napi-rs** (`cel/cel-napi/`)

## Build Commands

```bash
make build          # Build everything (Rust + TypeScript)
make build-rust     # cargo build --workspace
make build-ts       # pnpm install && pnpm build
make test           # Run all tests
make lint           # Lint Rust + TypeScript
make clean          # Clean all build artifacts
```

## Conventions

- Rust: platform-specific code in `windows.rs` / `macos.rs` behind `#[cfg(target_os)]`
- TypeScript: strict mode, ES2022 target
- All CEL crate names prefixed with `cel-` (e.g., `cel-display`, `cel-input`)
- All TS packages scoped under `@cellar/` (e.g., `@cellar/agent`, `@cellar/cli`)
- Adapters use the `AdapterTrait` from `adapter-common`

## Key Architecture

The unified context API (`cel-context`) merges 5 streams:
1. Display (screen capture)
2. Input (mouse/keyboard events)
3. Accessibility (UIA/AXUIElement tree)
4. Vision (AI vision models)
5. Network (traffic monitoring)

Every element has a confidence score and source attribution.
