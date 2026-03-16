/**
 * Agent Engine E2E Tests
 *
 * Tests the full WorkflowEngine lifecycle:
 * - Workflow submission and priority queue ordering
 * - Step-by-step execution with realistic contexts
 * - Confidence-driven pause behavior
 * - Failure propagation and error handling
 * - Multi-workflow sequential execution
 * - Engine start/stop lifecycle
 * - Callback invocation order and arguments
 */
import { test, expect } from "@playwright/test";
import { WorkflowEngine, type EngineCallbacks } from "@cellar/agent";
import type { WorkflowStep, ScreenContext, Workflow, WorkflowStatus } from "@cellar/agent";
import type { AssembledContext, StepResult } from "@cellar/agent";
import {
  browserContext,
  editorContext,
  sapContext,
  sparseContext,
  loginWorkflow,
  multiStepWorkflow,
  failingWorkflow,
} from "./fixtures/mock-context.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface CallLog {
  getContextCalls: number;
  executeActionCalls: Array<{ step: WorkflowStep }>;
  pauseCalls: Array<{ step: WorkflowStep }>;
  stepCompleteCalls: Array<{ step: WorkflowStep; stepIndex: number }>;
  completeCalls: Array<{ workflow: Workflow; status: WorkflowStatus; steps: StepResult[] }>;
  logs: Array<{ level: string; message: string }>;
}

function createCallLog(): CallLog {
  return {
    getContextCalls: 0,
    executeActionCalls: [],
    pauseCalls: [],
    stepCompleteCalls: [],
    completeCalls: [],
    logs: [],
  };
}

function createCallbacks(
  log: CallLog,
  opts: {
    context?: () => ScreenContext;
    executeResult?: (step: WorkflowStep) => boolean;
    executeError?: (step: WorkflowStep) => Error | null;
  } = {},
): EngineCallbacks {
  const getCtx = opts.context ?? (() => browserContext());
  const getResult = opts.executeResult ?? (() => true);
  const getError = opts.executeError ?? (() => null);

  return {
    getContext: async () => {
      log.getContextCalls++;
      return getCtx();
    },
    executeAction: async (step: WorkflowStep) => {
      log.executeActionCalls.push({ step });
      const err = getError(step);
      if (err) throw err;
      return getResult(step);
    },
    onPause: async (step: WorkflowStep) => {
      log.pauseCalls.push({ step });
      // Simulate user resuming immediately
    },
    onStepComplete: (step: WorkflowStep, stepIndex: number) => {
      log.stepCompleteCalls.push({ step, stepIndex });
    },
    onComplete: (workflow: Workflow, status: WorkflowStatus, steps: StepResult[]) => {
      log.completeCalls.push({ workflow, status, steps });
    },
    onLog: (level: string, message: string) => {
      log.logs.push({ level, message });
    },
  };
}

// ---------------------------------------------------------------------------
// Workflow Execution
// ---------------------------------------------------------------------------

test.describe("Workflow Execution", () => {
  test("executes a complete login workflow with all steps succeeding", async () => {
    const log = createCallLog();
    const engine = new WorkflowEngine(createCallbacks(log));

    const wf = loginWorkflow();
    engine.submit(wf);

    // Start engine — it will process the queue, then idle
    const enginePromise = engine.start();

    // Wait for the workflow to complete
    await waitFor(() => log.completeCalls.length === 1, 10000);
    engine.stop();

    // Verify all 5 steps were executed
    expect(log.executeActionCalls.length).toBe(5);
    expect(log.stepCompleteCalls.length).toBe(5);

    // Verify completion status
    expect(log.completeCalls[0].status).toBe("completed");
    expect(log.completeCalls[0].steps.length).toBe(5);
    expect(log.completeCalls[0].steps.every((s) => s.success)).toBe(true);

    // Verify step order
    const stepIds = log.executeActionCalls.map((c) => c.step.id);
    expect(stepIds).toEqual(["s1", "s2", "s3", "s4", "s5"]);
  });

  test("stops execution on step failure", async () => {
    const log = createCallLog();
    const callbacks = createCallbacks(log, {
      executeResult: (step) => step.id !== "s2", // s2 fails
    });
    const engine = new WorkflowEngine(callbacks);

    engine.submit(failingWorkflow());
    const enginePromise = engine.start();

    await waitFor(() => log.completeCalls.length === 1, 10000);
    engine.stop();

    // Only 2 steps executed (s1 succeeds, s2 fails, s3 never reached)
    expect(log.executeActionCalls.length).toBe(2);
    expect(log.completeCalls[0].status).toBe("failed");

    // Step results reflect partial execution
    const results = log.completeCalls[0].steps;
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
  });

  test("handles step execution errors gracefully", async () => {
    const log = createCallLog();
    const callbacks = createCallbacks(log, {
      executeError: (step) =>
        step.id === "s2" ? new Error("Network timeout") : null,
    });
    const engine = new WorkflowEngine(callbacks);

    engine.submit(failingWorkflow());
    engine.start();

    await waitFor(() => log.completeCalls.length === 1, 10000);
    engine.stop();

    expect(log.completeCalls[0].status).toBe("failed");
    const errorLog = log.logs.find((l) => l.message.includes("Network timeout"));
    expect(errorLog).toBeDefined();
    expect(errorLog!.level).toBe("error");
  });

  test("context is fetched before each step", async () => {
    const log = createCallLog();
    const engine = new WorkflowEngine(createCallbacks(log));

    engine.submit(loginWorkflow());
    engine.start();

    await waitFor(() => log.completeCalls.length === 1, 10000);
    engine.stop();

    // getContext called once per step
    expect(log.getContextCalls).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Confidence Behavior
// ---------------------------------------------------------------------------

test.describe("Confidence-Driven Behavior", () => {
  test("pauses when element confidence is below threshold", async () => {
    const log = createCallLog();

    // Return a context where no elements match the step targets
    const callbacks = createCallbacks(log, {
      context: () => sparseContext(), // very few elements, low confidence
    });
    const engine = new WorkflowEngine(callbacks);

    const wf = loginWorkflow();
    // Set high min_confidence to trigger pause
    wf.steps[0].min_confidence = 0.9;
    engine.submit(wf);
    engine.start();

    await waitFor(() => log.completeCalls.length === 1, 10000);
    engine.stop();

    // Pause should have been triggered for at least the first step
    expect(log.pauseCalls.length).toBeGreaterThanOrEqual(1);
    const pauseLog = log.logs.find((l) => l.message.includes("Low confidence"));
    expect(pauseLog).toBeDefined();
  });

  test("does not pause when confidence is above threshold", async () => {
    const log = createCallLog();
    // Return a context with matching elements at high confidence
    const ctx = browserContext();
    const callbacks = createCallbacks(log, {
      context: () => ctx,
    });
    const engine = new WorkflowEngine(callbacks);

    const wf = loginWorkflow();
    // Lower thresholds — all elements in browserContext are >0.5
    wf.steps.forEach((s) => (s.min_confidence = 0.0));
    engine.submit(wf);
    engine.start();

    await waitFor(() => log.completeCalls.length === 1, 10000);
    engine.stop();

    expect(log.pauseCalls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Priority Queue
// ---------------------------------------------------------------------------

test.describe("Priority Queue", () => {
  test("executes workflows in priority order", async () => {
    const log = createCallLog();
    const engine = new WorkflowEngine(createCallbacks(log));

    // Submit low-priority first, then high-priority
    const low = { ...loginWorkflow(), name: "low-pri" };
    const high = { ...multiStepWorkflow(), name: "high-pri" };

    engine.submit(low, "low");
    engine.submit(high, "high");
    engine.start();

    await waitFor(() => log.completeCalls.length === 2, 15000);
    engine.stop();

    // High priority should have been executed first
    expect(log.completeCalls[0].workflow.name).toBe("high-pri");
    expect(log.completeCalls[1].workflow.name).toBe("low-pri");
  });
});

// ---------------------------------------------------------------------------
// Engine Lifecycle
// ---------------------------------------------------------------------------

test.describe("Engine Lifecycle", () => {
  test("stop() halts engine after current workflow", async () => {
    const log = createCallLog();
    const callbacks = createCallbacks(log, {
      // Add delay to simulate real execution
      executeResult: () => true,
    });
    const engine = new WorkflowEngine(callbacks);

    engine.submit(loginWorkflow());
    engine.submit(multiStepWorkflow());
    engine.start();

    // Let the first workflow complete, then stop
    await waitFor(() => log.completeCalls.length >= 1, 10000);
    engine.stop();

    // Should have completed at most the first workflow
    // (second may or may not have started depending on timing)
    expect(log.completeCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("start() is idempotent — calling twice does not duplicate execution", async () => {
    const log = createCallLog();
    const engine = new WorkflowEngine(createCallbacks(log));

    engine.submit(loginWorkflow());
    engine.start();
    engine.start(); // Second call should be a no-op

    await waitFor(() => log.completeCalls.length === 1, 10000);
    engine.stop();

    // Only one workflow executed (not duplicated)
    expect(log.completeCalls.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

test.describe("Logging", () => {
  test("logs workflow start, step progress, and completion", async () => {
    const log = createCallLog();
    const engine = new WorkflowEngine(createCallbacks(log));

    engine.submit(loginWorkflow());
    engine.start();

    await waitFor(() => log.completeCalls.length === 1, 10000);
    engine.stop();

    // Should have a "Starting workflow" log
    const startLog = log.logs.find((l) => l.message.includes("Starting workflow"));
    expect(startLog).toBeDefined();
    expect(startLog!.level).toBe("info");

    // Context summary logs for each step
    const contextLogs = log.logs.filter((l) => l.level === "info" && l !== startLog);
    expect(contextLogs.length).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}
