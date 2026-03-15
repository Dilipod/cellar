/**
 * Context Assembly Pipeline
 *
 * Assembles the full context for a workflow run step, inspired by:
 * - Mastra's processor chain: WorkingMemory → Observations → SemanticRecall → History
 * - OpenClaw's bootstrap file loading with budget caps
 *
 * For each step, the context includes:
 * 1. Workflow definition (what we're doing)
 * 2. Working memory (per-workflow scratchpad — field mappings, preferences)
 * 3. Observations (compressed knowledge from past runs)
 * 4. Relevant knowledge (FTS5 search results for this step)
 * 5. Current screen context (live UI elements)
 * 6. Recent step history (what happened so far in this run)
 */

import type { Cel, ObservationRecord, ScoredKnowledgeRecord } from "./cel-bindings.js";
import type {
  Workflow,
  WorkflowStep,
  ScreenContext,
} from "./types.js";

// Re-export for convenience
export type Observation = ObservationRecord;
export type ScoredKnowledge = ScoredKnowledgeRecord;

/** A completed step for recent history context. */
export interface StepResult {
  stepIndex: number;
  stepId: string;
  description: string;
  success: boolean;
  confidence: number;
}

/** The assembled context for a workflow step. */
export interface AssembledContext {
  /** The workflow being executed */
  workflow: {
    name: string;
    description: string;
    app: string;
    currentStep: number;
    totalSteps: number;
  };
  /** Per-workflow scratchpad (always present) */
  workingMemory: string;
  /** Compressed observations from past runs (high priority first) */
  observations: Observation[];
  /** Relevant knowledge facts (FTS5 scored) */
  knowledge: ScoredKnowledge[];
  /** Live screen context */
  screen: ScreenContext;
  /** Steps completed so far in this run */
  recentSteps: StepResult[];
  /** The current step to execute */
  currentStep: WorkflowStep;
}

/** Configuration for the context assembly pipeline. */
export interface ContextAssemblyConfig {
  /** Max observations to load (default: 50) */
  maxObservations?: number;
  /** Max knowledge results per step (default: 5) */
  maxKnowledge?: number;
  /** Max recent steps to include (default: 10) */
  maxRecentSteps?: number;
}

const DEFAULTS: Required<ContextAssemblyConfig> = {
  maxObservations: 50,
  maxKnowledge: 5,
  maxRecentSteps: 10,
};

/**
 * Assemble the full context for a workflow step.
 * This is the "brain" that gathers all memory layers before execution.
 */
export function assembleContext(
  cel: Cel,
  workflow: Workflow,
  stepIndex: number,
  screen: ScreenContext,
  completedSteps: StepResult[],
  config: ContextAssemblyConfig = {},
): AssembledContext {
  const cfg = { ...DEFAULTS, ...config };
  const step = workflow.steps[stepIndex];

  // 1. Working memory (per-workflow scratchpad)
  const workingMemory = cel.getWorkingMemory(workflow.name);

  // 2. Observations from past runs (compressed knowledge)
  const observations = cel.getObservations(workflow.name, cfg.maxObservations);

  // 3. Knowledge search — use step description as search query
  const knowledge = cel.searchKnowledge(
    step.description,
    workflow.name,
    cfg.maxKnowledge,
  );

  // 4. Recent steps (bounded window)
  const recentSteps = completedSteps.slice(-cfg.maxRecentSteps);

  return {
    workflow: {
      name: workflow.name,
      description: workflow.description,
      app: workflow.app,
      currentStep: stepIndex,
      totalSteps: workflow.steps.length,
    },
    workingMemory,
    observations,
    knowledge,
    screen,
    recentSteps,
    currentStep: step,
  };
}

/**
 * Format assembled context into a human-readable summary for logging.
 */
export function formatContextSummary(ctx: AssembledContext): string {
  const lines: string[] = [];
  lines.push(`=== Context for step ${ctx.workflow.currentStep + 1}/${ctx.workflow.totalSteps} ===`);
  lines.push(`Workflow: ${ctx.workflow.name} (${ctx.workflow.app})`);
  lines.push(`Step: [${ctx.currentStep.id}] ${ctx.currentStep.description}`);
  lines.push(`Screen: app="${ctx.screen.app}" window="${ctx.screen.window}" elements=${ctx.screen.elements.length}`);

  if (ctx.workingMemory) {
    const lines_count = ctx.workingMemory.split("\n").length;
    lines.push(`Working memory: ${lines_count} lines`);
  }

  if (ctx.observations.length > 0) {
    const high = ctx.observations.filter((o) => o.priority === "high").length;
    const med = ctx.observations.filter((o) => o.priority === "medium").length;
    lines.push(`Observations: ${ctx.observations.length} (${high} high, ${med} medium)`);
  }

  if (ctx.knowledge.length > 0) {
    lines.push(`Knowledge: ${ctx.knowledge.length} relevant facts`);
  }

  if (ctx.recentSteps.length > 0) {
    const succeeded = ctx.recentSteps.filter((s) => s.success).length;
    lines.push(`Recent steps: ${succeeded}/${ctx.recentSteps.length} succeeded`);
  }

  return lines.join("\n");
}
