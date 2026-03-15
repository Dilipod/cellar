/**
 * CEL Native Bindings Interface
 *
 * Type-safe wrapper around the napi-rs native module.
 * In production, these call into the Rust CEL core via cel-napi.
 * For development/testing, a mock implementation is used when the native module isn't available.
 */

import type { ScreenContext, Bounds } from "./types.js";

/** CEL native module interface — matches the napi exports from cel-napi. */
export interface CelNative {
  celVersion(): string;
  getContext(): string;
  captureScreen(): Buffer;
  listMonitors(): string;
  listWindows(): string;
  mouseMove(x: number, y: number): void;
  click(x: number, y: number): void;
  rightClick(x: number, y: number): void;
  doubleClick(x: number, y: number): void;
  typeText(text: string): void;
  keyPress(key: string): void;
  keyCombo(keys: string[]): void;
  scroll(dx: number, dy: number): void;
  queryKnowledge(dbPath: string, query: string): string;
  addKnowledge(dbPath: string, content: string, source: string): number;
  startRun(dbPath: string, workflowName: string, stepsTotal: number): number;
  finishRun(dbPath: string, runId: number, status: string): void;
}

/** Monitor info from CEL display layer. */
export interface MonitorInfo {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  is_primary: boolean;
}

/** Window info from CEL display layer. */
export interface WindowInfo {
  id: number;
  title: string;
  app_name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  is_minimized: boolean;
}

/** Knowledge fact from CEL Store. */
export interface KnowledgeFact {
  id: number;
  content: string;
  source: string;
  created_at: string;
}

let _native: CelNative | null = null;

/** Load the native CEL module. Returns null if not available. */
function loadNative(): CelNative | null {
  if (_native) return _native;
  try {
    // Try to load the napi-rs compiled module
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _native = require("@cellar/cel-napi") as CelNative;
    return _native;
  } catch {
    return null;
  }
}

/**
 * High-level CEL API — wraps native bindings with proper TypeScript types.
 */
export class Cel {
  private native: CelNative | null;
  private dbPath: string;

  constructor(dbPath = "~/.cellar/cel-store.db") {
    this.native = loadNative();
    this.dbPath = dbPath.replace("~", process.env.HOME ?? "");
  }

  /** Whether the native module is available. */
  get isNativeAvailable(): boolean {
    return this.native !== null;
  }

  /** Get CEL version. */
  version(): string {
    return this.native?.celVersion() ?? "0.1.0-mock";
  }

  // --- Display ---

  /** Get the unified screen context. */
  getContext(): ScreenContext {
    if (!this.native) {
      return { app: "", window: "", elements: [], timestamp_ms: Date.now() };
    }
    return JSON.parse(this.native.getContext());
  }

  /** Capture a screenshot as PNG buffer. */
  captureScreen(): Buffer {
    if (!this.native) {
      throw new Error("Native module not available");
    }
    return this.native.captureScreen();
  }

  /** List available monitors. */
  listMonitors(): MonitorInfo[] {
    if (!this.native) return [];
    return JSON.parse(this.native.listMonitors());
  }

  /** List visible windows. */
  listWindows(): WindowInfo[] {
    if (!this.native) return [];
    return JSON.parse(this.native.listWindows());
  }

  // --- Input ---

  /** Move mouse to absolute coordinates. */
  mouseMove(x: number, y: number): void {
    this.native?.mouseMove(x, y);
  }

  /** Left-click at coordinates. */
  click(x: number, y: number): void {
    this.native?.click(x, y);
  }

  /** Right-click at coordinates. */
  rightClick(x: number, y: number): void {
    this.native?.rightClick(x, y);
  }

  /** Double-click at coordinates. */
  doubleClick(x: number, y: number): void {
    this.native?.doubleClick(x, y);
  }

  /** Type text using fast unicode input. */
  typeText(text: string): void {
    this.native?.typeText(text);
  }

  /** Press a single key. */
  keyPress(key: string): void {
    this.native?.keyPress(key);
  }

  /** Press a key combination. */
  keyCombo(keys: string[]): void {
    this.native?.keyCombo(keys);
  }

  /** Scroll at current position. */
  scroll(dx: number, dy: number): void {
    this.native?.scroll(dx, dy);
  }

  // --- Knowledge ---

  /** Query the knowledge store. */
  queryKnowledge(query: string): KnowledgeFact[] {
    if (!this.native) return [];
    return JSON.parse(this.native.queryKnowledge(this.dbPath, query));
  }

  /** Add a fact to the knowledge store. */
  addKnowledge(content: string, source: string): number {
    if (!this.native) return -1;
    return this.native.addKnowledge(this.dbPath, content, source);
  }

  // --- Run Tracking ---

  /** Start tracking a workflow run. */
  startRun(workflowName: string, stepsTotal: number): number {
    if (!this.native) return -1;
    return this.native.startRun(this.dbPath, workflowName, stepsTotal);
  }

  /** Finish a tracked workflow run. */
  finishRun(runId: number, status: "completed" | "failed"): void {
    this.native?.finishRun(this.dbPath, runId, status);
  }
}
