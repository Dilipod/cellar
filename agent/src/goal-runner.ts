/**
 * Goal Runner — the universal observe-plan-act loop for any adapter.
 *
 * This is the single source of truth for LLM-driven automation in Cellar.
 * Works with ANY context source (browser, desktop, SAP, Excel, etc.)
 * via the GoalRunnerCallbacks interface.
 *
 * Capabilities (consolidated from benchmark learnings vs Browser-Use OSS):
 * 1. Grounding validation — prevent hallucinated element IDs
 * 2. Loop detection — repeat, ping-pong, AND stale context
 * 3. Vision fallback — screenshot escalation when DOM is sparse
 * 4. State change detection — abort when context shifts mid-step
 * 5. Done validation — verify goal before accepting LLM's claim
 * 6. Tiered waits — adapter-specific settle behavior per action type
 * 7. Context caching — skip re-extraction when state unchanged
 * 8. Metrics collection — timing, tokens, errors, vision count
 * 9. Timeout + error limits — abort on timeout or N consecutive failures
 */

import type { Cel } from "./cel-bindings.js";
import type {
  ScreenContext,
  PlannedStep,
  PlannedAction,
  PlannerStepRecord,
  GoalMetrics,
  WorkflowAction,
  WorkflowStep,
} from "./types.js";
import { executeAction, type AdapterRegistry } from "./action-executor.js";

// ─── Configuration ────────────────────────────────────────────────────────────

/** Configuration for a goal execution. */
export interface GoalRunnerConfig {
  /** The natural-language goal to achieve. */
  goal: string;
  /** Maximum number of steps before giving up. Default: 30. */
  maxSteps?: number;
  /** Milliseconds to wait between steps (fallback when no waitForSettle). Default: 500. */
  stepDelay?: number;
  /** Total timeout in milliseconds. Default: 120_000. */
  taskTimeout?: number;
  /** Max consecutive failures before aborting. Default: 8. */
  maxConsecutiveFailures?: number;
  /** Enable vision fallback when adapter provides screenshot(). Default: true. */
  enableVision?: boolean;
}

/** Result of a goal execution. */
export interface GoalResult {
  status: "achieved" | "failed" | "max_steps" | "timeout";
  summary: string;
  totalSteps: number;
  history: PlannerStepRecord[];
  /** Execution metrics for benchmarking / observability. */
  metrics?: GoalMetrics;
}

// ─── Callbacks (adapter contract) ─────────────────────────────────────────────

/**
 * Callbacks for goal execution — the adapter contract.
 *
 * Only `getContext` is required. Everything else is optional and
 * enables progressively richer behavior (vision, state detection, etc.).
 * Works identically for browser, desktop, SAP, Excel, or any adapter.
 */
export interface GoalRunnerCallbacks {
  /** Get the current screen/page context. REQUIRED. */
  getContext: () => Promise<ScreenContext>;

  /**
   * Take a screenshot for vision fallback. OPTIONAL.
   * When provided, the runner sends a screenshot to the LLM when:
   * - First step (orientation)
   * - Sparse context (<5 actionable elements)
   * - 2+ consecutive failures
   */
  screenshot?: () => Promise<Buffer>;

  /**
   * Return a fingerprint of the current application state. OPTIONAL.
   * Used to detect when an action caused a state transition.
   * When the fingerprint changes, the tentative plan is discarded and
   * context cache is invalidated, forcing a fresh extraction + re-plan.
   *
   * Examples:
   * - Browser: `() => page.url()`
   * - Desktop: `() => windowTitle`
   * - SAP: `() => transactionCode + screenNumber`
   */
  stateFingerprint?: () => string;

  /**
   * Wait for the UI to settle after an action. OPTIONAL.
   * Called after actions that may trigger transitions (click, navigate, etc.).
   * The adapter decides what "settled" means (DOM idle, screen repaint, etc.).
   *
   * If not provided, uses default tiered waits per action type.
   */
  waitForSettle?: (actionType: string) => Promise<void>;

  /**
   * Verify that the goal has actually been achieved. OPTIONAL.
   * Called when the LLM claims "done". If this returns false,
   * the runner tells the LLM "verification failed" and continues.
   */
  verifyGoal?: () => Promise<boolean>;

  // --- Event callbacks (all optional) ---

  /** Called when a step is planned. */
  onStepPlanned?: (step: PlannedStep, index: number) => void;
  /** Called when a step is executed. */
  onStepExecuted?: (step: PlannedStep, index: number, success: boolean, error?: string) => void;
  /** Called when the goal is achieved or failed. */
  onComplete?: (result: GoalResult) => void;
}

// ─── Action conversion ────────────────────────────────────────────────────────

/**
 * Convert a PlannedAction to a WorkflowAction for the existing executor.
 * PlannedAction uses `target_id`, WorkflowAction uses `target`.
 */
export function plannedToWorkflowAction(action: PlannedAction): WorkflowAction | null {
  switch (action.type) {
    case "click":
      return { type: "click", target: action.target_id };
    case "type":
      return { type: "type", target: action.target_id, text: action.text };
    case "key":
      return { type: "key", key: action.key };
    case "key_combo":
      return { type: "key_combo", keys: action.keys };
    case "scroll":
      return { type: "scroll", dx: action.dx, dy: action.dy };
    case "wait":
      return { type: "wait", ms: action.ms };
    case "custom":
      return { type: "custom", adapter: action.adapter, action: action.action, params: action.params };
    case "done":
    case "fail":
      return null;
  }
}

// ─── Grounding validation ─────────────────────────────────────────────────────

const ERROR_KEYWORDS = ["error", "failed", "denied", "forbidden", "unauthorized"];

/** Validate that a planned step references real elements and isn't claiming false success. */
function validateGrounding(step: PlannedStep, context: ScreenContext): string | null {
  const action = step.action;

  if (action.type === "click" || action.type === "type") {
    const targetId = action.target_id;
    const exists = context.elements.some((el) => el.id === targetId);
    if (!exists) {
      const available = context.elements.slice(0, 10).map((el) => el.id);
      return `Element ID '${targetId}' not found in context. Available: [${available.join(", ")}]`;
    }
  }

  if (action.type === "done") {
    for (const el of context.elements) {
      if (el.label && el.state?.visible) {
        const lower = el.label.toLowerCase();
        if (ERROR_KEYWORDS.some((kw) => lower.includes(kw))) {
          return `Cannot claim done — error element visible: '${el.label}' (${el.id})`;
        }
      }
    }
    for (const ev of context.network_events ?? []) {
      if (ev.status && ev.status >= 400) {
        return `Cannot claim done — HTTP ${ev.status} on ${ev.url?.slice(0, 50)}`;
      }
    }
    const evidenceIds = (action as { evidence_ids?: string[] }).evidence_ids;
    if (evidenceIds) {
      for (const eid of evidenceIds) {
        if (!context.elements.some((el) => el.id === eid)) {
          return `Evidence element '${eid}' not found in context`;
        }
      }
    }
  }

  return null;
}

// ─── Loop detection (repeat + ping-pong + stale context) ──────────────────────

const LOOP_WINDOW = 8;
const REPEAT_THRESHOLD = 3;
const STALE_THRESHOLD = 3;
const LOOP_GRACE_STEPS = 2;

type LoopSignal =
  | { type: "none" }
  | { type: "repeat"; action: string; count: number }
  | { type: "ping_pong"; actionA: string; actionB: string }
  | { type: "stale_context"; stepsUnchanged: number };

/**
 * Loop detector — ported from Rust cel-planner + benchmark additions.
 * Detects three loop types: repeat (3x same action), ping-pong (A-B-A-B),
 * and stale context (3 unchanged context hashes despite actions).
 */
class LoopDetector {
  private actionHashes: number[] = [];
  private actionSummaries: string[] = [];
  private contextHashes: number[] = [];
  private graceRemaining: number | null = null;

  check(action: PlannedAction, contextHash: number): LoopSignal {
    const summary = actionSignature(action);
    this.actionHashes.push(simpleHash(summary));
    this.actionSummaries.push(summary);
    if (this.actionHashes.length > LOOP_WINDOW) {
      this.actionHashes.shift();
      this.actionSummaries.shift();
    }

    this.contextHashes.push(contextHash);
    if (this.contextHashes.length > LOOP_WINDOW) {
      this.contextHashes.shift();
    }

    if (this.graceRemaining !== null) {
      this.graceRemaining--;
    }

    return this.detectRepeat() ?? this.detectPingPong() ?? this.detectStale() ?? { type: "none" };
  }

  shouldAutoFail(): boolean {
    return this.graceRemaining !== null && this.graceRemaining <= 0;
  }

  startGrace(): void {
    this.graceRemaining = LOOP_GRACE_STEPS;
  }

  getWarning(signal: LoopSignal): string {
    switch (signal.type) {
      case "repeat":
        return `You repeated "${signal.action}" ${signal.count} times. You MUST try a completely different approach.`;
      case "ping_pong":
        return `You're alternating between "${signal.actionA}" and "${signal.actionB}". You MUST try a completely different approach.`;
      case "stale_context":
        return `Context hasn't changed for ${signal.stepsUnchanged} steps despite actions. Try a completely different approach.`;
      default:
        return "";
    }
  }

  private detectRepeat(): LoopSignal | null {
    const h = this.actionHashes;
    if (h.length < REPEAT_THRESHOLD) return null;
    const last = h.slice(-REPEAT_THRESHOLD);
    if (last.every((v) => v === last[0])) {
      return { type: "repeat", action: this.actionSummaries[this.actionSummaries.length - 1], count: REPEAT_THRESHOLD };
    }
    return null;
  }

  private detectPingPong(): LoopSignal | null {
    const h = this.actionHashes;
    if (h.length < 4) return null;
    const [a, b, c, d] = h.slice(-4);
    if (a === c && b === d && a !== b) {
      const s = this.actionSummaries;
      return { type: "ping_pong", actionA: s[s.length - 2], actionB: s[s.length - 1] };
    }
    return null;
  }

  private detectStale(): LoopSignal | null {
    const h = this.contextHashes;
    if (h.length < STALE_THRESHOLD) return null;
    const last = h.slice(-STALE_THRESHOLD);
    if (last.every((v) => v === last[0])) {
      return { type: "stale_context", stepsUnchanged: STALE_THRESHOLD };
    }
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

function contextFingerprint(context: ScreenContext): number {
  const ids = context.elements.slice(0, 5).map((e) => e.id).join(",");
  return simpleHash(`${context.app}:${context.window}:${context.elements.length}:${ids}`);
}

function cachedStepMatchesContext(step: PlannedStep, context: ScreenContext): boolean {
  const action = step.action;
  if (action.type === "click" || action.type === "type") {
    return context.elements.some((el) => el.id === action.target_id);
  }
  return true;
}

function actionSignature(action: PlannedAction): string {
  switch (action.type) {
    case "click": return `click:${action.target_id}`;
    case "type": return `type:${action.target_id}`;
    case "key": return `key:${action.key}`;
    case "key_combo": return `combo:${action.keys.join("+")}`;
    case "scroll": return `scroll:${action.dx},${action.dy}`;
    case "wait": return `wait:${action.ms}`;
    case "custom": return `custom:${action.adapter}.${action.action}`;
    case "done": return `done`;
    case "fail": return `fail`;
  }
}

/** Check if an action type typically causes a state transition. */
function isTransitionAction(action: PlannedAction): boolean {
  return action.type === "click" || action.type === "custom";
}

/** Default tiered wait times in ms, per action type. */
const DEFAULT_SETTLE_MS: Record<string, number> = {
  click: 800,
  custom: 500,
  type: 0,
  key: 200,
  key_combo: 200,
  scroll: 200,
  wait: 0,
};

/** Should we use vision on this step? */
function shouldUseVision(
  stepIndex: number,
  context: ScreenContext,
  consecutiveFailures: number,
  enableVision: boolean,
  hasScreenshot: boolean,
): boolean {
  if (!enableVision || !hasScreenshot) return false;
  const actionableCount = context.elements.filter(
    (e) => e.state.visible && e.state.enabled &&
      ((e.actions && e.actions.length > 0) ||
        ["button", "input", "select", "textarea", "a", "link"].includes(e.element_type)),
  ).length;
  return stepIndex === 0 || actionableCount < 5 || consecutiveFailures >= 2;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run a goal to completion using the planner + action executor.
 *
 * This is the main entry point for LLM-driven automation.
 * Works with any context source (browser adapter, desktop CEL, etc.)
 * and any adapter registry (browser actions, SAP actions, etc.).
 *
 * @example
 * ```ts
 * // Browser automation
 * const result = await runGoal(cel, {
 *   goal: "Search for houses on Funda.nl in Amsterdam under €500k",
 * }, {
 *   getContext: () => adapter.getContext(),
 *   screenshot: () => adapter.screenshot(),
 *   stateFingerprint: () => adapter.getPageUrl(),
 *   waitForSettle: (type) => adapter.waitForStable({ timeout: 800 }),
 *   verifyGoal: () => checkSearchResults(),
 * });
 *
 * // Desktop automation (SAP)
 * const result = await runGoal(cel, { goal: "Create purchase order" }, {
 *   getContext: () => cel.getContext(),
 *   stateFingerprint: () => `${sapSession.transactionCode}:${sapSession.screenNumber}`,
 * });
 * ```
 */
export async function runGoal(
  cel: Cel,
  config: GoalRunnerConfig,
  callbacks: GoalRunnerCallbacks,
  adapters?: AdapterRegistry,
): Promise<GoalResult> {
  const maxSteps = config.maxSteps ?? 30;
  const stepDelay = config.stepDelay ?? 500;
  const taskTimeout = config.taskTimeout ?? 120_000;
  const maxConsecutiveFailures = config.maxConsecutiveFailures ?? 8;
  const enableVision = config.enableVision ?? true;
  const startTime = Date.now();

  const history: PlannerStepRecord[] = [];
  const loopDetector = new LoopDetector();
  let loopWarning: string | null = null;
  let tentativePlan: PlannedStep[] = [];
  let consecutiveFailures = 0;
  let lastStateFingerprint: string | undefined;
  let cachedContext: ScreenContext | null = null;

  // Metrics
  const metrics: GoalMetrics = {
    totalMs: 0,
    contextExtractionMs: 0,
    llmCalls: 0,
    visionCalls: 0,
    errorCount: 0,
    stateChanges: 0,
    loopWarnings: 0,
  };

  /** Build a result object with current metrics. */
  function makeResult(
    status: GoalResult["status"],
    summary: string,
    totalSteps: number,
  ): GoalResult {
    metrics.totalMs = Date.now() - startTime;
    return { status, summary, totalSteps, history, metrics: { ...metrics } };
  }

  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex++) {
    // ── 1. CHECK timeout + consecutive failures ──────────────────────────
    if (Date.now() - startTime > taskTimeout) {
      const result = makeResult("timeout", `Timeout after ${taskTimeout}ms`, stepIndex);
      callbacks.onComplete?.(result);
      return result;
    }

    if (consecutiveFailures >= maxConsecutiveFailures) {
      const result = makeResult("failed", `Too many consecutive failures (${maxConsecutiveFailures})`, stepIndex);
      callbacks.onComplete?.(result);
      return result;
    }

    if (loopDetector.shouldAutoFail()) {
      const result = makeResult("failed", "Stuck in action loop", stepIndex);
      callbacks.onComplete?.(result);
      return result;
    }

    // ── 2. OBSERVE — get context (with smart caching) ────────────────────
    let needsFreshContext = cachedContext === null;

    // If adapter provides stateFingerprint, check if state changed
    if (callbacks.stateFingerprint && cachedContext !== null) {
      const currentFP = callbacks.stateFingerprint();
      if (currentFP !== lastStateFingerprint) {
        needsFreshContext = true;
        lastStateFingerprint = currentFP;
      }
    } else {
      needsFreshContext = true; // No fingerprint → always re-extract
    }

    let context: ScreenContext;
    if (needsFreshContext) {
      const ctxStart = Date.now();
      context = await callbacks.getContext();
      metrics.contextExtractionMs += Date.now() - ctxStart;
      cachedContext = context;
    } else {
      context = cachedContext!;
    }

    // ── 3. VISION DECISION ───────────────────────────────────────────────
    const useVision = shouldUseVision(
      stepIndex, context, consecutiveFailures,
      enableVision, !!callbacks.screenshot,
    );

    // ── 4. PLAN — try tentative cache, else call LLM (text or vision) ───
    let step: PlannedStep;

    if (tentativePlan.length > 0) {
      const cached = tentativePlan[0];
      if (cachedStepMatchesContext(cached, context)) {
        step = tentativePlan.shift()!;
      } else {
        tentativePlan = [];
        step = await planStep(cel, config.goal, context, history, loopWarning, maxSteps, useVision, callbacks);
        metrics.llmCalls++;
        if (useVision) metrics.visionCalls++;
      }
    } else {
      step = await planStep(cel, config.goal, context, history, loopWarning, maxSteps, useVision, callbacks);
      metrics.llmCalls++;
      if (useVision) metrics.visionCalls++;
    }

    callbacks.onStepPlanned?.(step, stepIndex);

    // ── 5. GROUNDING VALIDATION ──────────────────────────────────────────
    const groundingError = validateGrounding(step, context);
    if (groundingError) {
      history.push({
        step_index: stepIndex,
        action: step.action,
        success: false,
        error: `Grounding validation: ${groundingError}`,
      });
      callbacks.onStepExecuted?.(step, stepIndex, false, groundingError);
      metrics.errorCount++;
      consecutiveFailures++;
      loopWarning = null;
      cachedContext = null; // Force re-extraction
      await sleep(200);
      continue;
    }

    // ── 6. DONE VALIDATION ───────────────────────────────────────────────
    if (step.action.type === "done") {
      if (callbacks.verifyGoal) {
        let verified = false;
        try { verified = await callbacks.verifyGoal(); } catch { /* failed */ }

        if (!verified) {
          history.push({
            step_index: stepIndex,
            action: step.action,
            success: false,
            error: "Goal verification failed — task is not actually complete",
          });
          callbacks.onStepExecuted?.(step, stepIndex, false, "Goal verification failed");
          metrics.errorCount++;
          continue;
        }
      }

      const result = makeResult("achieved", step.action.summary, stepIndex);
      callbacks.onComplete?.(result);
      return result;
    }

    if (step.action.type === "fail") {
      const result = makeResult("failed", step.action.reason, stepIndex);
      callbacks.onComplete?.(result);
      return result;
    }

    // ── 7. EXECUTE action ────────────────────────────────────────────────
    const workflowAction = plannedToWorkflowAction(step.action);
    if (!workflowAction) continue;

    // Snapshot state before execution
    const preActionFP = callbacks.stateFingerprint?.();

    const workflowStep: WorkflowStep = {
      id: `planned-${stepIndex}`,
      description: step.reasoning,
      action: workflowAction,
    };

    let success = false;
    let error: string | undefined;
    try {
      success = await executeAction(cel, workflowStep, context, adapters);
      consecutiveFailures = 0;
    } catch (e) {
      error = String(e);
      metrics.errorCount++;
      consecutiveFailures++;
    }

    callbacks.onStepExecuted?.(step, stepIndex, success, error);

    // ── 8. SETTLE — wait for UI to stabilize ─────────────────────────────
    if (success && isTransitionAction(step.action)) {
      if (callbacks.waitForSettle) {
        await callbacks.waitForSettle(step.action.type);
      } else {
        const settleMs = DEFAULT_SETTLE_MS[step.action.type] ?? stepDelay;
        if (settleMs > 0) await sleep(settleMs);
      }
    }

    // ── 9. STATE CHANGE DETECTION ────────────────────────────────────────
    if (success && callbacks.stateFingerprint && preActionFP !== undefined) {
      const postActionFP = callbacks.stateFingerprint();
      if (postActionFP !== preActionFP) {
        tentativePlan = [];     // Discard stale plan
        cachedContext = null;    // Force re-extraction
        lastStateFingerprint = postActionFP;
        metrics.stateChanges++;
      }
    }

    // ── 10. RECORD history ───────────────────────────────────────────────
    history.push({
      step_index: stepIndex,
      action: step.action,
      success,
      error,
    });

    // ── 11. LOOP DETECTION ───────────────────────────────────────────────
    const ctxHash = contextFingerprint(context);
    const signal = loopDetector.check(step.action, ctxHash);
    if (signal.type !== "none") {
      loopWarning = loopDetector.getWarning(signal);
      metrics.loopWarnings++;
      loopDetector.startGrace();
    } else {
      loopWarning = null;
    }

    // Brief pause if not handled by settle
    if (!success && stepDelay > 0) {
      await sleep(stepDelay);
    }
  }

  // Exceeded max steps
  const result = makeResult("max_steps", `Exceeded ${maxSteps} steps without achieving goal`, maxSteps);
  callbacks.onComplete?.(result);
  return result;
}

// ─── Planning helper (text vs vision) ─────────────────────────────────────────

async function planStep(
  cel: Cel,
  goal: string,
  context: ScreenContext,
  history: PlannerStepRecord[],
  loopWarning: string | null,
  maxSteps: number,
  useVision: boolean,
  callbacks: GoalRunnerCallbacks,
): Promise<PlannedStep> {
  const effectiveGoal = loopWarning
    ? `${goal}\n\nWARNING: ${loopWarning}`
    : goal;

  const planOptions = {
    maxSteps,
    loopWarning: loopWarning ?? undefined,
  };

  // Vision path: screenshot + structured context → LLM
  if (useVision && callbacks.screenshot) {
    try {
      const buf = await callbacks.screenshot();
      const base64 = buf.toString("base64");
      return await cel.planStepWithVision(effectiveGoal, context, base64, history, planOptions);
    } catch {
      // Vision failed — fall through to text-only
    }
  }

  // Text-only path: structured context → Rust planner → LLM
  return cel.planStep(effectiveGoal, context, history, planOptions);
}
