import { describe, it, expect, vi } from "vitest";
import { assembleContext, formatContextSummary, type StepResult } from "./context-assembly.js";
import type { Workflow, ScreenContext } from "./types.js";

function makeCel(overrides: Record<string, unknown> = {}) {
  return {
    getWorkingMemory: vi.fn().mockReturnValue("# Mappings\n- Vendor X → 10045"),
    getObservations: vi.fn().mockReturnValue([
      { id: 1, content: "Vendor X always maps to code 10045", priority: "high", workflow_name: "daily-po" },
      { id: 2, content: "SAP takes ~3s after Submit", priority: "medium", workflow_name: "daily-po" },
    ]),
    searchKnowledge: vi.fn().mockReturnValue([
      { id: 1, content: "PO field requires 8-digit code", score: 0.85 },
    ]),
    ...overrides,
  } as any;
}

function makeWorkflow(): Workflow {
  return {
    name: "daily-po",
    description: "Daily purchase order entry",
    app: "SAP",
    version: "1.0.0",
    steps: [
      { id: "s1", description: "Open PO form", action: { type: "click", target: "po-btn" } },
      { id: "s2", description: "Enter vendor code", action: { type: "type", target: "vendor-field", text: "10045" } },
      { id: "s3", description: "Submit", action: { type: "click", target: "submit-btn" } },
    ],
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
  };
}

function makeScreen(): ScreenContext {
  return {
    app: "SAP",
    window: "Create PO",
    elements: [
      { id: "po-btn", element_type: "button", confidence: 0.95, source: "accessibility_tree" },
    ],
    timestamp_ms: Date.now(),
  };
}

describe("assembleContext", () => {
  it("should assemble all context layers", () => {
    const cel = makeCel();
    const ctx = assembleContext(cel, makeWorkflow(), 0, makeScreen(), []);

    expect(ctx.workflow.name).toBe("daily-po");
    expect(ctx.workflow.currentStep).toBe(0);
    expect(ctx.workflow.totalSteps).toBe(3);
    expect(ctx.workingMemory).toContain("Vendor X");
    expect(ctx.observations).toHaveLength(2);
    expect(ctx.knowledge).toHaveLength(1);
    expect(ctx.screen.app).toBe("SAP");
    expect(ctx.currentStep.id).toBe("s1");
  });

  it("should pass workflow name to memory lookups", () => {
    const cel = makeCel();
    assembleContext(cel, makeWorkflow(), 1, makeScreen(), []);

    expect(cel.getWorkingMemory).toHaveBeenCalledWith("daily-po");
    expect(cel.getObservations).toHaveBeenCalledWith("daily-po", 50);
    expect(cel.searchKnowledge).toHaveBeenCalledWith("Enter vendor code", "daily-po", 5);
  });

  it("should limit recent steps", () => {
    const cel = makeCel();
    const steps: StepResult[] = Array.from({ length: 20 }, (_, i) => ({
      stepIndex: i,
      stepId: `s${i}`,
      description: `Step ${i}`,
      success: true,
      confidence: 0.9,
    }));

    const ctx = assembleContext(cel, makeWorkflow(), 2, makeScreen(), steps, {
      maxRecentSteps: 5,
    });
    expect(ctx.recentSteps).toHaveLength(5);
    expect(ctx.recentSteps[0].stepIndex).toBe(15); // last 5
  });

  it("should use custom config", () => {
    const cel = makeCel();
    assembleContext(cel, makeWorkflow(), 0, makeScreen(), [], {
      maxObservations: 10,
      maxKnowledge: 3,
    });

    expect(cel.getObservations).toHaveBeenCalledWith("daily-po", 10);
    expect(cel.searchKnowledge).toHaveBeenCalledWith("Open PO form", "daily-po", 3);
  });

  it("should handle empty memory gracefully", () => {
    const cel = makeCel({
      getWorkingMemory: vi.fn().mockReturnValue(""),
      getObservations: vi.fn().mockReturnValue([]),
      searchKnowledge: vi.fn().mockReturnValue([]),
    });

    const ctx = assembleContext(cel, makeWorkflow(), 0, makeScreen(), []);
    expect(ctx.workingMemory).toBe("");
    expect(ctx.observations).toHaveLength(0);
    expect(ctx.knowledge).toHaveLength(0);
  });
});

describe("formatContextSummary", () => {
  it("should format a readable summary", () => {
    const cel = makeCel();
    const ctx = assembleContext(cel, makeWorkflow(), 0, makeScreen(), [
      { stepIndex: 0, stepId: "s0", description: "Prep", success: true, confidence: 0.9 },
    ]);

    const summary = formatContextSummary(ctx);
    expect(summary).toContain("step 1/3");
    expect(summary).toContain("daily-po");
    expect(summary).toContain("SAP");
    expect(summary).toContain("Working memory: 2 lines");
    expect(summary).toContain("1 high");
    expect(summary).toContain("1 relevant facts");
    expect(summary).toContain("1/1 succeeded");
  });
});
