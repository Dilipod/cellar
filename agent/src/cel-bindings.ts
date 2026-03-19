/**
 * CEL Native Bindings Interface
 *
 * Type-safe wrapper around the napi-rs native module.
 * In production, these call into the Rust CEL core via cel-napi.
 * For development/testing, a mock implementation is used when the native module isn't available.
 */

import type {
  ScreenContext,
  ContextElement,
  ContextReference,
  FocusedContext,
  CelEvent,
  PageContent,
  Bounds,
  PlannedStep,
  PlannerStepRecord,
} from "./types.js";

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
  // Eviction / TTL
  runEviction(dbPath: string, runRetentionDays: number, knowledgeRetentionDays: number): string;
  // Context References
  makeReference(elementJson: string, screenWidth: number, screenHeight: number): string;
  resolveReference(contextJson: string, referenceJson: string): string;
  // Focused Context
  getContextFocused(elementId: string): string;
  // CDP
  cdpSetupInstall(): string;
  cdpSetupUninstall(): string;
  cdpIsSetup(): boolean;
  cdpDiscoverTargets(): string;
  cdpGetPageContent(): Promise<string>;
  // Watchdog
  startWatchdog(): void;
  pollEvents(): string;
  stopWatchdog(): void;
  // Planner
  planStep(
    goal: string,
    contextJson: string,
    historyJson: string,
    provider?: string,
    apiKey?: string,
    model?: string,
    endpoint?: string,
    maxTokens?: number,
    maxSteps?: number,
    loopWarning?: string,
  ): Promise<string>;
  // Prompt builder (returns { system, user } JSON without calling LLM)
  buildPlanPrompt(
    goal: string,
    contextJson: string,
    historyJson: string,
    maxSteps?: number,
    loopWarning?: string,
    provider?: string,
    model?: string,
  ): string;
  // Vision LLM call
  llmCompleteWithImage(
    systemPrompt: string,
    imageBase64: string,
    userPrompt: string,
    provider?: string,
    apiKey?: string,
    model?: string,
    endpoint?: string,
    maxTokens?: number,
  ): Promise<string>;
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

/** Eviction result from TTL cleanup. */
export interface EvictionResult {
  superseded_observations: number;
  old_runs: number;
  old_knowledge: number;
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

  // --- Eviction / TTL ---

  /** Run eviction policies. Returns counts of deleted rows. */
  runEviction(runRetentionDays = 90, knowledgeRetentionDays = 365): EvictionResult {
    if (!this.native) return { superseded_observations: 0, old_runs: 0, old_knowledge: 0 };
    return JSON.parse(this.native.runEviction(this.dbPath, runRetentionDays, knowledgeRetentionDays));
  }

  // --- Planner ---

  /** Plan a single step given a goal, current context, and step history. */
  async planStep(
    goal: string,
    context: ScreenContext,
    history: PlannerStepRecord[] = [],
    options?: {
      maxSteps?: number;
      loopWarning?: string;
    },
  ): Promise<PlannedStep> {
    if (!this.native) {
      throw new Error("Native module not available — planner requires cel-napi");
    }
    const contextJson = JSON.stringify(context);
    const historyJson = JSON.stringify(history);
    const resultJson = await this.native.planStep(
      goal,
      contextJson,
      historyJson,
      undefined, // provider — use env default
      undefined, // apiKey
      undefined, // model
      undefined, // endpoint
      undefined, // maxTokens
      options?.maxSteps,
      options?.loopWarning,
    );
    return JSON.parse(resultJson);
  }

  /**
   * Build the system + user prompts for planning WITHOUT calling the LLM.
   * Use this to get the exact prompts, then call planStepWithVision() separately.
   */
  buildPlanPrompt(
    goal: string,
    context: ScreenContext,
    history: PlannerStepRecord[] = [],
    options?: { maxSteps?: number; loopWarning?: string },
  ): { system: string; user: string } {
    if (!this.native) {
      throw new Error("Native module not available — buildPlanPrompt requires cel-napi");
    }
    const result = this.native.buildPlanPrompt(
      goal,
      JSON.stringify(context),
      JSON.stringify(history),
      options?.maxSteps,
      options?.loopWarning,
    );
    return JSON.parse(result);
  }

  /**
   * Plan a step with vision: sends structured context + screenshot to the LLM.
   * Used as a fallback when DOM is sparse or after consecutive failures.
   * Produces the exact same PlannedStep output as planStep().
   */
  async planStepWithVision(
    goal: string,
    context: ScreenContext,
    screenshotBase64: string,
    history: PlannerStepRecord[] = [],
    options?: { maxSteps?: number; loopWarning?: string },
  ): Promise<PlannedStep> {
    if (!this.native) {
      throw new Error("Native module not available — vision requires cel-napi");
    }
    // Get the same prompts planStep() would use
    const prompts = this.buildPlanPrompt(goal, context, history, options);
    // Add vision note to user prompt
    const userWithVision = prompts.user +
      "\n\n(A screenshot of the current screen is attached. Use it to identify elements " +
      "the structured context may have missed, especially overlays, cookie banners, or modals.)";
    // Call LLM with image
    const raw = await this.native.llmCompleteWithImage(
      prompts.system,
      screenshotBase64,
      userWithVision,
    );
    const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  }

  // --- Context References ---

  /** Create a resilient reference from an element.
   * The reference can be used to re-find the same element in future context snapshots. */
  makeReference(element: ContextElement, screenWidth = 1920, screenHeight = 1080): ContextReference {
    if (!this.native) {
      return { element_type: element.element_type, label: element.label };
    }
    return JSON.parse(
      this.native.makeReference(JSON.stringify(element), screenWidth, screenHeight),
    );
  }

  /** Resolve a reference against a screen context snapshot.
   * Returns the best-matching element, or null if no match. */
  resolveReference(context: ScreenContext, ref_: ContextReference): ContextElement | null {
    if (!this.native) return null;
    const result = this.native.resolveReference(
      JSON.stringify(context),
      JSON.stringify(ref_),
    );
    const parsed = JSON.parse(result);
    return parsed === null ? null : parsed;
  }

  // --- Focused Context ---

  /** Get high-fidelity context for a single element by ID. */
  getContextFocused(elementId: string): FocusedContext | null {
    if (!this.native) return null;
    const result = this.native.getContextFocused(elementId);
    const parsed = JSON.parse(result);
    return parsed === null ? null : parsed;
  }

  // --- Watchdog ---

  /** Start the context watchdog for change detection. */
  startWatchdog(): void {
    this.native?.startWatchdog();
  }

  /** Poll for watchdog events. Returns events that occurred since last poll. */
  pollEvents(): CelEvent[] {
    if (!this.native) return [];
    return JSON.parse(this.native.pollEvents());
  }

  /** Stop and reset the watchdog. */
  stopWatchdog(): void {
    this.native?.stopWatchdog();
  }

  // --- CDP ---

  /** Get page content from CDP if available. Returns null if no CDP target found. */
  async getCdpPageContent(): Promise<PageContent | null> {
    if (!this.native) return null;
    try {
      const result = await this.native.cdpGetPageContent();
      if (result === "null") return null;
      return JSON.parse(result);
    } catch {
      return null;
    }
  }

  /** Discover CDP targets on this machine. */
  discoverCdpTargets(): Array<{ app_name: string; pid: number; port: number; ws_url: string }> {
    if (!this.native) return [];
    try {
      return JSON.parse(this.native.cdpDiscoverTargets());
    } catch {
      return [];
    }
  }

  /** Check if CDP setup (LaunchAgent) is installed. */
  isCdpSetup(): boolean {
    return this.native?.cdpIsSetup() ?? false;
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
