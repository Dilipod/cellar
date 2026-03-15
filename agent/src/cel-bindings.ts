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
  logStep(
    dbPath: string,
    runId: number,
    stepIndex: number,
    stepId: string,
    action: string,
    success: boolean,
    confidence: number,
    contextSnapshot: string | null,
    error: string | null,
  ): number;
  getRunHistory(dbPath: string, limit: number): string;
  getStepResults(dbPath: string, runId: number): string;
  // Memory: Working Memory
  getWorkingMemory(dbPath: string, workflowName: string): string;
  updateWorkingMemory(dbPath: string, workflowName: string, content: string): void;
  // Memory: Observations
  addObservation(dbPath: string, workflowName: string, content: string, priority: string, sourceRunIds: number[]): number;
  getObservations(dbPath: string, workflowName: string, limit: number): string;
  // Memory: Knowledge FTS5
  searchKnowledge(dbPath: string, query: string, workflowScope: string | null, limit: number): string;
  addScopedKnowledge(dbPath: string, content: string, source: string, workflowScope: string | null, tags: string | null): number;
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

/** Run history record from CEL Store. */
export interface RunRecord {
  id: number;
  workflow_name: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  steps_completed: number;
  steps_total: number;
  interventions: number;
}

/** Observation from CEL Store. */
export interface ObservationRecord {
  id: number;
  workflow_name: string;
  content: string;
  priority: "high" | "medium" | "low";
  source_run_ids: string;
  observed_at: string;
  referenced_at: string | null;
  superseded_by: number | null;
  created_at: string;
}

/** Scored knowledge from FTS5 search. */
export interface ScoredKnowledgeRecord {
  id: number;
  content: string;
  source: string;
  workflow_scope: string | null;
  score: number;
  created_at: string;
}

/** Step result record from CEL Store. */
export interface StepRecord {
  id: number;
  run_id: number;
  step_index: number;
  step_id: string;
  action: string;
  success: boolean;
  confidence: number;
  context_snapshot: string | null;
  error: string | null;
  executed_at: string;
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

  /** Log a step result during a workflow run. */
  logStep(
    runId: number,
    stepIndex: number,
    stepId: string,
    action: string,
    success: boolean,
    confidence: number,
    contextSnapshot?: string,
    error?: string,
  ): number {
    if (!this.native) return -1;
    return this.native.logStep(
      this.dbPath,
      runId,
      stepIndex,
      stepId,
      action,
      success,
      confidence,
      contextSnapshot ?? null,
      error ?? null,
    );
  }

  /** Get run history, most recent first. */
  getRunHistory(limit = 20): RunRecord[] {
    if (!this.native) return [];
    return JSON.parse(this.native.getRunHistory(this.dbPath, limit));
  }

  /** Get step results for a specific run. */
  getStepResults(runId: number): StepRecord[] {
    if (!this.native) return [];
    return JSON.parse(this.native.getStepResults(this.dbPath, runId));
  }

  // --- Working Memory ---

  /** Get working memory content for a workflow. */
  getWorkingMemory(workflowName: string): string {
    if (!this.native) return "";
    const wm = JSON.parse(this.native.getWorkingMemory(this.dbPath, workflowName));
    return wm.content ?? "";
  }

  /** Update working memory for a workflow. */
  updateWorkingMemory(workflowName: string, content: string): void {
    this.native?.updateWorkingMemory(this.dbPath, workflowName, content);
  }

  // --- Observations ---

  /** Add an observation from past runs. */
  addObservation(
    workflowName: string,
    content: string,
    priority: "high" | "medium" | "low",
    sourceRunIds: number[],
  ): number {
    if (!this.native) return -1;
    return this.native.addObservation(this.dbPath, workflowName, content, priority, sourceRunIds);
  }

  /** Get active observations for a workflow. */
  getObservations(workflowName: string, limit = 50): ObservationRecord[] {
    if (!this.native) return [];
    return JSON.parse(this.native.getObservations(this.dbPath, workflowName, limit));
  }

  // --- Knowledge FTS5 ---

  /** Search knowledge using FTS5 full-text search. */
  searchKnowledge(query: string, workflowScope?: string, limit = 5): ScoredKnowledgeRecord[] {
    if (!this.native) return [];
    return JSON.parse(
      this.native.searchKnowledge(this.dbPath, query, workflowScope ?? null, limit),
    );
  }

  /** Add a scoped knowledge fact. */
  addScopedKnowledge(
    content: string,
    source: string,
    workflowScope?: string,
    tags?: string,
  ): number {
    if (!this.native) return -1;
    return this.native.addScopedKnowledge(
      this.dbPath, content, source, workflowScope ?? null, tags ?? null,
    );
  }
}
