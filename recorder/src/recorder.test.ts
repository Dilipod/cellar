import { describe, it, expect } from "vitest";
import { ExplicitRecorder } from "./explicit.js";
import { PassiveRecorder } from "./passive.js";
import type { ScreenContext } from "@cellar/agent";

function makeContext(app = "TestApp", elementCount = 2): ScreenContext {
  return {
    app,
    window: `${app} - Main`,
    elements: Array.from({ length: elementCount }, (_, i) => ({
      id: `elem-${i}`,
      element_type: "button",
      label: `Button ${i}`,
      confidence: 0.9,
      source: "accessibility_tree" as const,
    })),
    timestamp_ms: Date.now(),
  };
}

describe("ExplicitRecorder", () => {
  it("should start and stop recording", () => {
    const recorder = new ExplicitRecorder();
    expect(recorder.isRecording).toBe(false);

    recorder.start();
    expect(recorder.isRecording).toBe(true);

    recorder.stop();
    expect(recorder.isRecording).toBe(false);
  });

  it("should record steps", () => {
    const recorder = new ExplicitRecorder();
    recorder.start();
    recorder.recordStep(makeContext(), "click:btn-0");
    recorder.recordStep(makeContext(), "type:input-1:Hello");
    recorder.recordStep(makeContext(), "key:Enter");

    const steps = recorder.stop();
    expect(steps.length).toBe(3);
    expect(steps[0].action).toBe("click:btn-0");
    expect(steps[1].action).toBe("type:input-1:Hello");
  });

  it("should not record when not recording", () => {
    const recorder = new ExplicitRecorder();
    recorder.recordStep(makeContext(), "should-be-ignored");
    recorder.start();
    const steps = recorder.stop();
    expect(steps.length).toBe(0);
  });

  it("should reset steps on start", () => {
    const recorder = new ExplicitRecorder();
    recorder.start();
    recorder.recordStep(makeContext(), "step-1");
    recorder.stop();

    recorder.start(); // Should reset
    recorder.recordStep(makeContext(), "step-2");
    const steps = recorder.stop();
    expect(steps.length).toBe(1);
    expect(steps[0].action).toBe("step-2");
  });

  it("should convert to workflow", () => {
    const recorder = new ExplicitRecorder();
    recorder.start();
    recorder.recordStep(makeContext("Excel"), "click:cell-A1");
    recorder.recordStep(makeContext("Excel"), "type:cell-A1:Revenue");
    recorder.stop();

    const wf = recorder.toWorkflow("monthly-report", "Enter revenue data");
    expect(wf.name).toBe("monthly-report");
    expect(wf.description).toBe("Enter revenue data");
    expect(wf.app).toBe("Excel");
    expect(wf.steps.length).toBe(2);
    expect(wf.steps[0].id).toBe("step-0");
    expect(wf.steps[1].id).toBe("step-1");
  });

  it("should handle empty recording for toWorkflow", () => {
    const recorder = new ExplicitRecorder();
    const wf = recorder.toWorkflow("empty", "Nothing recorded");
    expect(wf.steps.length).toBe(0);
    expect(wf.app).toBe("unknown");
  });

  it("should identify target elements", () => {
    const recorder = new ExplicitRecorder();
    recorder.start();
    recorder.recordStep(makeContext(), "click:Button 0");
    const steps = recorder.stop();

    // Should find element by label match
    expect(steps[0].targetElement).toBeDefined();
    expect(steps[0].targetElement?.label).toBe("Button 0");
  });

  it("should track step count", () => {
    const recorder = new ExplicitRecorder();
    expect(recorder.stepCount).toBe(0);
    recorder.start();
    recorder.recordStep(makeContext(), "click:btn");
    recorder.recordStep(makeContext(), "click:btn");
    expect(recorder.stepCount).toBe(2);
  });

  it("should generate proper workflow actions", () => {
    const recorder = new ExplicitRecorder();
    recorder.start();
    recorder.recordStep(makeContext(), "click:target");
    recorder.recordStep(makeContext(), "type:field:Hello World");
    recorder.recordStep(makeContext(), "key:Enter");
    recorder.recordStep(makeContext(), "key_combo:Ctrl:S");
    recorder.recordStep(makeContext(), "scroll:0:100");
    recorder.recordStep(makeContext(), "wait:2000");
    recorder.stop();

    const wf = recorder.toWorkflow("test", "test");
    expect(wf.steps[0].action).toEqual({ type: "click", target: "target" });
    expect(wf.steps[1].action).toEqual({ type: "type", target: "field", text: "Hello World" });
    expect(wf.steps[2].action).toEqual({ type: "key", key: "Enter" });
    expect(wf.steps[3].action).toEqual({ type: "key_combo", keys: ["Ctrl", "S"] });
    expect(wf.steps[4].action).toEqual({ type: "scroll", dx: 0, dy: 100 });
    expect(wf.steps[5].action).toEqual({ type: "wait", ms: 2000 });
  });

  it("should set expected context from next step", () => {
    const recorder = new ExplicitRecorder();
    recorder.start();
    recorder.recordStep(makeContext("AppA"), "click:btn");
    recorder.recordStep(makeContext("AppB"), "click:btn");
    recorder.stop();

    const wf = recorder.toWorkflow("test", "test");
    expect(wf.steps[0].expected?.app).toBe("AppB");
    expect(wf.steps[1].expected).toBeUndefined(); // Last step has no expected
  });
});

describe("PassiveRecorder", () => {
  it("should start and stop observation", () => {
    const recorder = new PassiveRecorder("medium");
    recorder.start();
    recorder.stop();
    // Should not throw
  });

  it("should return empty patterns initially", () => {
    const recorder = new PassiveRecorder();
    expect(recorder.getPatterns()).toEqual([]);
  });

  it("should not process context when not recording", () => {
    const recorder = new PassiveRecorder();
    recorder.onContext(makeContext());
    expect(recorder.getPatterns()).toEqual([]);
  });

  it("should process context when recording", () => {
    const recorder = new PassiveRecorder();
    recorder.start();
    recorder.onContext(makeContext());
    recorder.stop();
  });

  it("should detect app-switch patterns", () => {
    const recorder = new PassiveRecorder("high"); // High frequency = check often
    recorder.start();

    // Simulate A→B→A→B→A→B pattern
    for (let i = 0; i < 20; i++) {
      const app = i % 2 === 0 ? "Excel" : "SAP";
      recorder.onContext(makeContext(app));
    }

    recorder.stop();
    const patterns = recorder.getPatterns();

    // Should detect the Excel → SAP switching pattern
    const switchPattern = patterns.find((p) => p.description.includes("→"));
    expect(switchPattern).toBeDefined();
    expect(switchPattern!.occurrences).toBeGreaterThanOrEqual(3);
  });

  it("should detect heavy app usage", () => {
    const recorder = new PassiveRecorder("high");
    recorder.start();

    // Simulate heavy Excel usage
    for (let i = 0; i < 60; i++) {
      recorder.onContext(makeContext("Excel"));
    }

    recorder.stop();
    const patterns = recorder.getPatterns();
    const burstPattern = patterns.find((p) => p.description.includes("Heavy usage"));
    expect(burstPattern).toBeDefined();
    expect(burstPattern!.occurrences).toBeGreaterThan(50);
  });

  it("should create workflow draft from pattern", () => {
    const recorder = new PassiveRecorder();
    const pattern = {
      description: "App switch: Excel → SAP",
      occurrences: 5,
      firstSeen: new Date(),
      lastSeen: new Date(),
      steps: ["Switch to Excel", "Switch to SAP"],
    };
    const draft = recorder.toWorkflowDraft(pattern);
    expect(draft.name).toBe("untitled");
    expect(draft.description).toContain("Auto-detected");
    expect(draft.steps).toHaveLength(2);
    expect(draft.steps![0].action.type).toBe("custom");
  });

  it("should set frequency", () => {
    const recorder = new PassiveRecorder("low");
    recorder.setFrequency("high");
    // No getter, but should not throw
  });

  it("should cap history size", () => {
    const recorder = new PassiveRecorder("high");
    recorder.start();

    // Push more than maxHistory
    for (let i = 0; i < 1200; i++) {
      recorder.onContext(makeContext("App"));
    }

    recorder.stop();
    // Should not crash, patterns should still work
    expect(recorder.getPatterns()).toBeDefined();
  });
});
