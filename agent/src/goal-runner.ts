/**
 * Goal Runner — ties the planner loop together with execution.
 *
 * Runs the observe-plan-act loop in TypeScript:
 * 1. Get context (from CEL or browser adapter)
 * 2. Call cel-planner via NAPI to get the next PlannedStep
 * 3. Convert PlannedAction → WorkflowAction and execute
 * 4. Record result, loop
 *
 * This is where understanding meets execution — the planner sees
 * context elements as tools (with IDs and available actions) and
 * picks the right one, then this runner executes it through the
 * existing action infrastructure.
 */

import type { Cel } from "./cel-bindings.js";
import type {
  ScreenContext,
  PlannedStep,
  PlannedAction,
  PlannerStepRecord,
  WorkflowAction,
  WorkflowStep,
} from "./types.js";
import { executeAction, type AdapterRegistry } from "./action-executor.js";

/** Configuration for a goal execution. */
export interface GoalRunnerConfig {
  /** The natural-language goal to achieve. */
  goal: string;
  /** Maximum number of steps before giving up. Default: 30. */
  maxSteps?: number;
  /** Milliseconds to wait between steps for UI to settle. Default: 500. */
  stepDelay?: number;
}

/** Result of a goal execution. */
export interface GoalResult {
  status: "achieved" | "failed" | "max_steps";
  summary: string;
  totalSteps: number;
  history: PlannerStepRecord[];
}

/** Callbacks for goal execution events. */
export interface GoalRunnerCallbacks {
  /** Get the current screen context. */
  getContext: () => Promise<ScreenContext>;
  /** Called when a step is planned. */
  onStepPlanned?: (step: PlannedStep, index: number) => void;
  /** Called when a step is executed. */
  onStepExecuted?: (step: PlannedStep, index: number, success: boolean, error?: string) => void;
  /** Called when the goal is achieved or failed. */
  onComplete?: (result: GoalResult) => void;
}

/**
 * Convert a PlannedAction to a WorkflowAction for the existing executor.
 *
 * PlannedAction uses `target_id` (element ID from context),
 * WorkflowAction uses `target` — this bridge maps between them.
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
      return null; // Terminal — not executed
  }
}

/**
 * Run a goal to completion using the planner + action executor.
 *
 * This is the main entry point for LLM-driven automation.
 * Works with any context source (browser adapter, desktop CEL, etc.)
 * and any adapter registry (browser actions, SAP actions, etc.).
 */
export async function runGoal(
  cel: Cel,
  config: GoalRunnerConfig,
  callbacks: GoalRunnerCallbacks,
  adapters?: AdapterRegistry,
): Promise<GoalResult> {
  const maxSteps = config.maxSteps ?? 30;
  const stepDelay = config.stepDelay ?? 500;
  const history: PlannerStepRecord[] = [];

  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex++) {
    // 1. OBSERVE — get current screen state
    const context = await callbacks.getContext();

    // 2. PLAN — ask the LLM for the next step
    const step = await cel.planStep(config.goal, context, history);

    callbacks.onStepPlanned?.(step, stepIndex);

    // 3. CHECK for terminal actions
    if (step.action.type === "done") {
      const result: GoalResult = {
        status: "achieved",
        summary: step.action.summary,
        totalSteps: stepIndex,
        history,
      };
      callbacks.onComplete?.(result);
      return result;
    }

    if (step.action.type === "fail") {
      const result: GoalResult = {
        status: "failed",
        summary: step.action.reason,
        totalSteps: stepIndex,
        history,
      };
      callbacks.onComplete?.(result);
      return result;
    }

    // 4. CONVERT PlannedAction → WorkflowAction
    const workflowAction = plannedToWorkflowAction(step.action);
    if (!workflowAction) {
      // Should not happen for non-terminal actions
      continue;
    }

    // 5. EXECUTE via existing action executor
    const workflowStep: WorkflowStep = {
      id: `planned-${stepIndex}`,
      description: step.reasoning,
      action: workflowAction,
    };

    let success = false;
    let error: string | undefined;
    try {
      success = await executeAction(cel, workflowStep, context, adapters);
    } catch (e) {
      error = String(e);
    }

    callbacks.onStepExecuted?.(step, stepIndex, success, error);

    // 6. RECORD for next iteration's LLM prompt
    history.push({
      step_index: stepIndex,
      action: step.action,
      success,
      error,
    });

    // Brief pause for UI to settle
    if (stepDelay > 0) {
      await new Promise((r) => setTimeout(r, stepDelay));
    }
  }

  // Exceeded max steps
  const result: GoalResult = {
    status: "max_steps",
    summary: `Exceeded ${maxSteps} steps without achieving goal`,
    totalSteps: maxSteps,
    history,
  };
  callbacks.onComplete?.(result);
  return result;
}
