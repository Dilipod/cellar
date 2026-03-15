import { describe, it, expect, vi } from "vitest";
import { WorkflowEngine, type EngineCallbacks } from "./engine.js";
import type { Workflow, ScreenContext, WorkflowStep } from "./types.js";

function makeWorkflow(steps: number): Workflow {
  return {
    name: "test-workflow",
    description: "A test workflow",
    app: "test-app",
    version: "1.0.0",
    steps: Array.from({ length: steps }, (_, i) => ({
      id: `step-${i}`,
      description: `Step ${i}`,
      action: { type: "click" as const, target: `target-${i}` },
    })),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function makeContext(confidence = 0.9): ScreenContext {
  return {
    app: "test-app",
    window: "Main",
    elements: [
      {
        id: "elem-1",
        label: "Button",
        element_type: "button",
        confidence,
        source: "accessibility_tree",
      },
    ],
    timestamp_ms: Date.now(),
  };
}

function makeCallbacks(overrides: Partial<EngineCallbacks> = {}): EngineCallbacks {
  return {
    getContext: vi.fn(async () => makeContext()),
    executeAction: vi.fn(async () => true),
    onPause: vi.fn(async () => {}),
    onStepComplete: vi.fn(),
    onComplete: vi.fn(),
    onLog: vi.fn(),
    ...overrides,
  };
}

describe("WorkflowEngine", () => {
  it("should submit workflows and return an ID", () => {
    const callbacks = makeCallbacks();
    const engine = new WorkflowEngine(callbacks);
    const id = engine.submit(makeWorkflow(2));
    expect(id).toMatch(/^wf-/);
  });

  it("should execute all steps of a workflow", async () => {
    const callbacks = makeCallbacks();
    const engine = new WorkflowEngine(callbacks);
    const wf = makeWorkflow(3);
    engine.submit(wf);

    // Start engine briefly then stop
    const startPromise = engine.start();
    // Give it time to process
    await new Promise((r) => setTimeout(r, 100));
    engine.stop();
    await startPromise;

    expect(callbacks.executeAction).toHaveBeenCalledTimes(3);
    expect(callbacks.onStepComplete).toHaveBeenCalledTimes(3);
    expect(callbacks.onComplete).toHaveBeenCalledWith(wf, "completed");
  });

  it("should stop on step failure", async () => {
    const callbacks = makeCallbacks({
      executeAction: vi.fn(async (step: WorkflowStep) => {
        // Fail on step-1
        return step.id !== "step-1";
      }),
    });
    const engine = new WorkflowEngine(callbacks);
    engine.submit(makeWorkflow(3));

    const startPromise = engine.start();
    await new Promise((r) => setTimeout(r, 100));
    engine.stop();
    await startPromise;

    expect(callbacks.onComplete).toHaveBeenCalledWith(
      expect.anything(),
      "failed"
    );
  });

  it("should stop on step exception", async () => {
    const callbacks = makeCallbacks({
      executeAction: vi.fn(async () => {
        throw new Error("Boom");
      }),
    });
    const engine = new WorkflowEngine(callbacks);
    engine.submit(makeWorkflow(2));

    const startPromise = engine.start();
    await new Promise((r) => setTimeout(r, 100));
    engine.stop();
    await startPromise;

    expect(callbacks.onLog).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("Boom")
    );
    expect(callbacks.onComplete).toHaveBeenCalledWith(
      expect.anything(),
      "failed"
    );
  });

  it("should call onPause when confidence is too low", async () => {
    const callbacks = makeCallbacks({
      getContext: vi.fn(async () => makeContext(0.1)), // Very low confidence
    });
    const engine = new WorkflowEngine(callbacks);
    engine.submit(makeWorkflow(1));

    const startPromise = engine.start();
    await new Promise((r) => setTimeout(r, 100));
    engine.stop();
    await startPromise;

    expect(callbacks.onPause).toHaveBeenCalled();
  });

  it("should not start twice", async () => {
    const callbacks = makeCallbacks();
    const engine = new WorkflowEngine(callbacks);

    const p1 = engine.start();
    const p2 = engine.start(); // Should return immediately
    engine.stop();
    await Promise.all([p1, p2]);
  });

  it("should handle priority in submission", () => {
    const callbacks = makeCallbacks();
    const engine = new WorkflowEngine(callbacks);
    const id1 = engine.submit(makeWorkflow(1), "low");
    const id2 = engine.submit(makeWorkflow(1), "critical");
    expect(id1).not.toBe(id2);
  });
});
