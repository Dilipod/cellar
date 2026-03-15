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
    // Pattern detection is TODO, but this should not throw
    recorder.stop();
  });

  it("should create workflow draft from pattern", () => {
    const recorder = new PassiveRecorder();
    const pattern = {
      description: "Copy-paste pattern",
      occurrences: 5,
      firstSeen: new Date(),
      lastSeen: new Date(),
      steps: ["Ctrl+C", "Switch window", "Ctrl+V"],
    };
    const draft = recorder.toWorkflowDraft(pattern);
    expect(draft.name).toBe("untitled");
    expect(draft.description).toBe("Auto-detected pattern");
  });

  it("should set frequency", () => {
    const recorder = new PassiveRecorder("low");
    recorder.setFrequency("high");
    // No getter, but should not throw
  });
});
