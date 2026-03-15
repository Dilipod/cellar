/**
 * Post-Run Hooks — automatically extract observations and update working memory
 * after a workflow run completes.
 *
 * Inspired by Mastra's observation generation: analyzes completed run step history
 * to extract durable insights that improve future runs.
 */

import type { Cel, StepRecord } from "./cel-bindings.js";
import type { StepResult } from "./context-assembly.js";
import type { RunTranscript } from "./transcript.js";

/** Result of post-run processing. */
export interface PostRunResult {
  observationsCreated: number;
  workingMemoryUpdated: boolean;
  knowledgeAdded: number;
}

/**
 * Run all post-run hooks after a workflow completes.
 */
export function processPostRun(
  cel: Cel,
  workflowName: string,
  runId: number,
  steps: StepResult[],
  transcript?: RunTranscript,
): PostRunResult {
  const result: PostRunResult = {
    observationsCreated: 0,
    workingMemoryUpdated: false,
    knowledgeAdded: 0,
  };

  // 1. Extract observations from step patterns
  const observations = extractObservations(workflowName, runId, steps);
  for (const obs of observations) {
    const id = cel.addObservation(workflowName, obs.content, obs.priority, [runId]);
    if (id > 0) {
      result.observationsCreated++;
      transcript?.logObservationGenerated(id, obs.content, obs.priority);
    }
  }

  // 2. Update working memory with run summary
  const updated = updateWorkingMemory(cel, workflowName, runId, steps);
  result.workingMemoryUpdated = updated;

  // 3. Extract knowledge from failures (learn from mistakes)
  const knowledge = extractFailureKnowledge(workflowName, steps);
  for (const k of knowledge) {
    const id = cel.addScopedKnowledge(k.content, "auto:post-run", workflowName, k.tags);
    if (id > 0) result.knowledgeAdded++;
  }

  return result;
}

/** An observation to create. */
interface PendingObservation {
  content: string;
  priority: "high" | "medium" | "low";
}

/**
 * Extract observations from step results.
 * Looks for patterns: failures, low confidence, interventions.
 */
function extractObservations(
  workflowName: string,
  runId: number,
  steps: StepResult[],
): PendingObservation[] {
  const observations: PendingObservation[] = [];

  // Pattern 1: Steps that failed — high priority observation
  const failedSteps = steps.filter((s) => !s.success);
  if (failedSteps.length > 0) {
    const failDescriptions = failedSteps
      .map((s) => `step ${s.stepIndex} "${s.stepId}": ${s.description}`)
      .join("; ");
    observations.push({
      content: `Run #${runId} failed at: ${failDescriptions}`,
      priority: "high",
    });
  }

  // Pattern 2: Steps with consistently low confidence — medium priority
  const lowConfSteps = steps.filter((s) => s.success && s.confidence > 0 && s.confidence < 0.7);
  if (lowConfSteps.length > 0) {
    const lowDescriptions = lowConfSteps
      .map((s) => `"${s.stepId}" (${Math.round(s.confidence * 100)}%)`)
      .join(", ");
    observations.push({
      content: `Low confidence steps in run #${runId}: ${lowDescriptions}. These may need attention.`,
      priority: "medium",
    });
  }

  // Pattern 3: Perfect run — low priority (confirms workflow is stable)
  const allSucceeded = steps.length > 0 && steps.every((s) => s.success);
  const avgConf = steps.length > 0
    ? steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length
    : 0;
  if (allSucceeded && avgConf >= 0.9) {
    observations.push({
      content: `Run #${runId} completed perfectly (${steps.length} steps, avg confidence ${Math.round(avgConf * 100)}%).`,
      priority: "low",
    });
  }

  return observations;
}

/**
 * Update working memory with latest run summary.
 * Appends run stats while keeping existing content.
 */
function updateWorkingMemory(
  cel: Cel,
  workflowName: string,
  runId: number,
  steps: StepResult[],
): boolean {
  const existing = cel.getWorkingMemory(workflowName);

  const succeeded = steps.filter((s) => s.success).length;
  const failed = steps.filter((s) => !s.success).length;
  const avgConf = steps.length > 0
    ? Math.round((steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length) * 100)
    : 0;

  const now = new Date().toISOString().split("T")[0];
  const runSummary = `- Run #${runId} (${now}): ${succeeded}/${steps.length} steps, avg ${avgConf}% confidence${failed > 0 ? `, ${failed} failed` : ""}`;

  // Parse existing content to maintain structure
  const lines = existing.split("\n").filter((l) => l.trim().length > 0);

  // Find or create the "Recent Runs" section
  const recentIdx = lines.findIndex((l) => l.startsWith("# Recent Runs"));
  if (recentIdx >= 0) {
    // Insert new run after the header, keep last 5 runs
    const beforeSection = lines.slice(0, recentIdx + 1);
    const runLines = lines.slice(recentIdx + 1).filter((l) => l.startsWith("- Run #"));
    runLines.unshift(runSummary);
    const kept = runLines.slice(0, 5);
    const afterRuns = lines.slice(recentIdx + 1).filter((l) => !l.startsWith("- Run #"));
    const updated = [...beforeSection, ...kept, ...afterRuns].join("\n");
    cel.updateWorkingMemory(workflowName, updated);
  } else {
    // Append a new section
    const updated = existing.trim().length > 0
      ? `${existing.trim()}\n\n# Recent Runs\n${runSummary}`
      : `# Recent Runs\n${runSummary}`;
    cel.updateWorkingMemory(workflowName, updated);
  }

  return true;
}

/** Knowledge extracted from failures. */
interface PendingKnowledge {
  content: string;
  tags: string;
}

/**
 * Extract knowledge from step failures to learn from mistakes.
 */
function extractFailureKnowledge(
  workflowName: string,
  steps: StepResult[],
): PendingKnowledge[] {
  const knowledge: PendingKnowledge[] = [];

  for (const step of steps) {
    if (!step.success) {
      knowledge.push({
        content: `Step "${step.stepId}" (${step.description}) failed with confidence ${Math.round(step.confidence * 100)}% in workflow "${workflowName}".`,
        tags: "failure,auto-extracted",
      });
    }
  }

  return knowledge;
}
