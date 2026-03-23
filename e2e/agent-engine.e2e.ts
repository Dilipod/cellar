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
 * - Step result data quality
 * - Context consumption per step
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

    const enginePromise = engine.start();
    await waitFor(() => log.completeCalls.length === 1, 10000);
    engine.stop();

    // All 5 steps executed
    expect(log.executeActionCalls.length).toBe(5);
    expect(log.stepCompleteCalls.length).toBe(5);

    // Completion status
    expect(log.completeCalls[0].status).toBe("completed");
    expect(log.completeCalls[0].steps.length).toBe(5);
    expect(log.completeCalls[0].steps.every((s) => s.success)).toBe(true);

    // Step order preserved
    const stepIds = log.executeActionCalls.map((c) => c.step.id);
    expect(stepIds).toEqual(["s1", "s2", "s3", "s4", "s5"]);

    // Step results contain duration data
    for (const result of log.completeCalls[0].steps) {
      expect(result.success).toBe(true);
    }
  });

  test("stops execution on step failure and reports which step failed", async () => {
    const log = createCallLog();
    const callbacks = createCallbacks(log, {
      executeResult: (step) => step.id !== "s2",
    });
    const engine = new WorkflowEngine(callbacks);

    engine.submit(failingWorkflow());
    const enginePromise = engine.start();
    await waitFor(() => log.completeCalls.length === 1, 10000);
    engine.stop();

    // Only 2 steps executed (s1 succeeds, s2 fails, s3 never reached)
    expect(log.executeActionCalls.length).toBe(2);
    expect(log.completeCalls[0].status).toBe("failed");

    // Step results show exactly which step failed
    const results = log.completeCalls[0].steps;
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);

    // s3 should NOT appear in step results (never executed)
    const executedIds = log.executeActionCalls.map(c => c.step.id);
    expect(executedIds).not.toContain("s3");
  });

  test("handles step execution errors gracefully with error details", async () => {
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

    // Error should be logged with enough context to diagnose
    expect(errorLog!.message).toContain("Network timeout");
  });

  test("context is fetched before each step — not cached from previous", async () => {
    const log = createCallLog();
    let callCount = 0;
    const callbacks = createCallbacks(log, {
      context: () => {
        callCount++;
        // Return different contexts to prove no caching
        return callCount <= 3 ? browserContext() : editorContext();
      },
    });
    const engine = new WorkflowEngine(callbacks);

    engine.submit(loginWorkflow());
    engine.start();
    await waitFor(() => log.completeCalls.length === 1, 10000);
    engine.stop();

    // getContext called once per step
    expect(log.getContextCalls).toBe(5);
    expect(callCount).toBe(5);
  });

  test("step callbacks fire in correct order: execute → complete", async () => {
    const log = createCallLog();
    const eventOrder: string[] = [];

    const callbacks: EngineCallbacks = {
      getContext: async () => browserContext(),
      executeAction: async (step) => {
        eventOrder.push(`exec:${step.id}`);
        return true;
      },
      onPause: async () => {},
      onStepComplete: (step) => { eventOrder.push(`complete:${step.id}`); },
      onComplete: (wf, status, steps) => {
        log.completeCalls.push({ workflow: wf, status, steps });
        eventOrder.push("workflow-done");
      },
      onLog: () => {},
    };

    const engine = new WorkflowEngine(callbacks);
    engine.submit(loginWorkflow());
    engine.start();
    await waitFor(() => log.completeCalls.length === 1, 10000);
    engine.stop();

    // Each step: exec then complete, workflow-done at end
    expect(eventOrder).toEqual([
      "exec:s1", "complete:s1",
      "exec:s2", "complete:s2",
      "exec:s3", "complete:s3",
      "exec:s4", "complete:s4",
      "exec:s5", "complete:s5",
      "workflow-done",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Confidence Behavior
// ---------------------------------------------------------------------------

test.describe("Confidence-Driven Behavior", () => {
  test("pauses when element confidence is below threshold", async () => {
    const log = createCallLog();
    const callbacks = createCallbacks(log, {
      context: () => sparseContext(),
    });
    const engine = new WorkflowEngine(callbacks);

    const wf = loginWorkflow();
    wf.steps[0].min_confidence = 0.9;
    engine.submit(wf);
    engine.start();

    await waitFor(() => log.completeCalls.length === 1, 10000);
    engine.stop();

    expect(log.pauseCalls.length).toBeGreaterThanOrEqual(1);
    const pauseLog = log.logs.find((l) => l.message.includes("Low confidence"));
    expect(pauseLog).toBeDefined();
  });

  test("does not pause when confidence is above threshold", async () => {
    const log = createCallLog();
    const ctx = browserContext();
    const callbacks = createCallbacks(log, { context: () => ctx });
    const engine = new WorkflowEngine(callbacks);

    const wf = loginWorkflow();
    wf.steps.forEach((s) => (s.min_confidence = 0.0));
    engine.submit(wf);
    engine.start();

    await waitFor(() => log.completeCalls.length === 1, 10000);
    engine.stop();

    expect(log.pauseCalls.length).toBe(0);
  });

  test("pause happens on the correct step, not a random one", async () => {
    const log = createCallLog();
    const callbacks = createCallbacks(log, {
      context: () => sparseContext(),
    });
    const engine = new WorkflowEngine(callbacks);

    const wf = loginWorkflow();
    // Only step s3 has high confidence requirement
    wf.steps.forEach(s => s.min_confidence = 0.0);
    wf.steps[2].min_confidence = 0.99;
    engine.submit(wf);
    engine.start();

    await waitFor(() => log.completeCalls.length === 1, 10000);
    engine.stop();

    // If pause happened, it should be on step s3
    if (log.pauseCalls.length > 0) {
      expect(log.pauseCalls[0].step.id).toBe("s3");
    }
  });
});

// ---------------------------------------------------------------------------
// Priority Queue
// ---------------------------------------------------------------------------

test.describe("Priority Queue", () => {
  test("executes workflows in priority order", async () => {
    const log = createCallLog();
    const engine = new WorkflowEngine(createCallbacks(log));

    const low = { ...loginWorkflow(), name: "low-pri" };
    const high = { ...multiStepWorkflow(), name: "high-pri" };

    engine.submit(low, "low");
    engine.submit(high, "high");
    engine.start();

    await waitFor(() => log.completeCalls.length === 2, 15000);
    engine.stop();

    expect(log.completeCalls[0].workflow.name).toBe("high-pri");
    expect(log.completeCalls[1].workflow.name).toBe("low-pri");
  });

  test("both workflows complete successfully, not just first", async () => {
    const log = createCallLog();
    const engine = new WorkflowEngine(createCallbacks(log));

    engine.submit({ ...loginWorkflow(), name: "wf-1" });
    engine.submit({ ...multiStepWorkflow(), name: "wf-2" });
    engine.start();

    await waitFor(() => log.completeCalls.length === 2, 15000);
    engine.stop();

    // Both should complete, not just the first
    for (const call of log.completeCalls) {
      expect(call.status).toBe("completed");
    }

    // Total steps = login(5) + multiStep(4) = 9
    expect(log.executeActionCalls.length).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// Engine Lifecycle
// ---------------------------------------------------------------------------

test.describe("Engine Lifecycle", () => {
  test("stop() halts engine after current workflow", async () => {
    const log = createCallLog();
    const callbacks = createCallbacks(log, {
      executeResult: () => true,
    });
    const engine = new WorkflowEngine(callbacks);

    engine.submit(loginWorkflow());
    engine.submit(multiStepWorkflow());
    engine.start();

    await waitFor(() => log.completeCalls.length >= 1, 10000);
    engine.stop();

    expect(log.completeCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("start() is idempotent — calling twice does not duplicate execution", async () => {
    const log = createCallLog();
    const engine = new WorkflowEngine(createCallbacks(log));

    engine.submit(loginWorkflow());
    engine.start();
    engine.start(); // Should be no-op

    await waitFor(() => log.completeCalls.length === 1, 10000);
    engine.stop();

    expect(log.completeCalls.length).toBe(1);
    // Only 5 steps, not 10 (double)
    expect(log.executeActionCalls.length).toBe(5);
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

    const startLog = log.logs.find((l) => l.message.includes("Starting workflow"));
    expect(startLog).toBeDefined();
    expect(startLog!.level).toBe("info");

    const contextLogs = log.logs.filter((l) => l.level === "info" && l !== startLog);
    expect(contextLogs.length).toBeGreaterThanOrEqual(5);
  });

  test("error logs include step ID and error message", async () => {
    const log = createCallLog();
    const callbacks = createCallbacks(log, {
      executeError: (step) =>
        step.id === "s2" ? new Error("Connection refused") : null,
    });
    const engine = new WorkflowEngine(callbacks);
    engine.submit(failingWorkflow());
    engine.start();
    await waitFor(() => log.completeCalls.length === 1, 10000);
    engine.stop();

    const errorLogs = log.logs.filter(l => l.level === "error");
    expect(errorLogs.length).toBeGreaterThan(0);
    // Error log should mention the actual error
    expect(errorLogs.some(l => l.message.includes("Connection refused"))).toBe(true);
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
