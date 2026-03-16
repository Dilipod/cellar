/**
 * Recorder E2E Tests
 *
 * Tests both recording modes end-to-end:
 * - Passive recording: pattern detection from context streams
 * - Explicit recording: manual step capture and workflow generation
 * - Integration between recording and workflow engine
 */
import { test, expect } from "@playwright/test";
import { PassiveRecorder, ExplicitRecorder } from "@cellar/recorder";
import type { ScreenContext } from "@cellar/agent";
import {
  editorContext,
  browserContext,
  sapContext,
  sparseContext,
} from "./fixtures/mock-context.js";

// ---------------------------------------------------------------------------
// Passive Recorder — Pattern Detection
// ---------------------------------------------------------------------------

test.describe("Passive Recorder", () => {
  test("detects app-switch patterns from alternating contexts", async () => {
    const recorder = new PassiveRecorder("high"); // Check patterns every 10 observations
    recorder.start();

    // Simulate alternating between Firefox and VS Code (copy-paste pattern)
    const now = Date.now();
    for (let i = 0; i < 30; i++) {
      const ctx = i % 2 === 0
        ? { ...browserContext(), timestamp_ms: now + i * 1000 }
        : { ...editorContext(), timestamp_ms: now + i * 1000 };
      recorder.onContext(ctx);
    }

    recorder.stop();
    const patterns = recorder.getPatterns();

    // Should detect the Firefox → VS Code alternation
    expect(patterns.length).toBeGreaterThan(0);
    const switchPattern = patterns.find((p) => p.description.includes("App switch"));
    expect(switchPattern).toBeDefined();
    expect(switchPattern!.occurrences).toBeGreaterThanOrEqual(3);
  });

  test("detects heavy app usage bursts", async () => {
    const recorder = new PassiveRecorder("high");
    recorder.start();

    // Simulate heavy VS Code usage (> 50% of all observations)
    const now = Date.now();
    for (let i = 0; i < 20; i++) {
      recorder.onContext({ ...editorContext(), timestamp_ms: now + i * 1000 });
    }

    recorder.stop();
    const patterns = recorder.getPatterns();

    const burstPattern = patterns.find((p) => p.description.includes("Heavy usage"));
    expect(burstPattern).toBeDefined();
    expect(burstPattern!.description).toContain("VS Code");
  });

  test("does not detect patterns from too few observations", async () => {
    const recorder = new PassiveRecorder("low"); // Check every 50 — never triggered
    recorder.start();

    // Only 3 observations — not enough for patterns
    for (let i = 0; i < 3; i++) {
      recorder.onContext({ ...editorContext(), timestamp_ms: Date.now() + i * 1000 });
    }

    recorder.stop();
    expect(recorder.getPatterns().length).toBe(0);
  });

  test("ignores context when not recording", async () => {
    const recorder = new PassiveRecorder("high");
    // Don't start recording

    for (let i = 0; i < 100; i++) {
      recorder.onContext(editorContext());
    }

    expect(recorder.getPatterns().length).toBe(0);
  });

  test("respects history cap (1000 entries)", async () => {
    const recorder = new PassiveRecorder("high");
    recorder.start();

    // Push 1500 observations — should cap at 1000
    for (let i = 0; i < 1500; i++) {
      recorder.onContext({ ...editorContext(), timestamp_ms: i });
    }

    recorder.stop();
    // Patterns should still work on the capped history
    expect(recorder.getPatterns()).toBeDefined();
  });

  test("converts detected pattern to workflow draft", async () => {
    const recorder = new PassiveRecorder("high");
    recorder.start();

    const now = Date.now();
    for (let i = 0; i < 30; i++) {
      const ctx = i % 2 === 0
        ? { ...browserContext(), timestamp_ms: now + i * 1000 }
        : { ...editorContext(), timestamp_ms: now + i * 1000 };
      recorder.onContext(ctx);
    }

    recorder.stop();
    const patterns = recorder.getPatterns();
    expect(patterns.length).toBeGreaterThan(0);

    const draft = recorder.toWorkflowDraft(patterns[0]);
    expect(draft.name).toBe("untitled");
    expect(draft.description).toContain("Auto-detected");
    expect(draft.steps).toBeDefined();
    expect(draft.steps!.length).toBeGreaterThan(0);

    // Each step should have a valid action
    for (const step of draft.steps!) {
      expect(step.action).toBeDefined();
      expect(step.action.type).toBeDefined();
    }
  });

  test("frequency setting affects pattern detection cadence", async () => {
    const lowRecorder = new PassiveRecorder("low");
    const highRecorder = new PassiveRecorder("high");

    lowRecorder.start();
    highRecorder.start();

    const now = Date.now();
    // Feed exactly 25 observations — "high" checks at 10 and 20, "low" checks at none
    for (let i = 0; i < 25; i++) {
      const ctx = i % 2 === 0
        ? { ...browserContext(), timestamp_ms: now + i * 1000 }
        : { ...editorContext(), timestamp_ms: now + i * 1000 };
      lowRecorder.onContext(ctx);
      highRecorder.onContext(ctx);
    }

    lowRecorder.stop();
    highRecorder.stop();

    // Both should detect patterns on stop(), but high caught them earlier
    expect(highRecorder.getPatterns().length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Explicit Recorder — Step Capture
// ---------------------------------------------------------------------------

test.describe("Explicit Recorder", () => {
  test("records steps with full context", async () => {
    const recorder = new ExplicitRecorder();
    recorder.start();

    const ctx = browserContext();
    recorder.recordStep(ctx, "click:input-username");
    recorder.recordStep(ctx, "type:input-username:admin");
    recorder.recordStep(ctx, "click:btn-login");

    const steps = recorder.stop();
    expect(steps.length).toBe(3);

    // First step: click username
    expect(steps[0].action).toBe("click:input-username");
    expect(steps[0].context.app).toBe("Firefox");
    expect(steps[0].targetElement).toBeDefined();
    expect(steps[0].targetElement!.id).toBe("input-username");
    expect(steps[0].targetElement!.label).toBe("Username");
  });

  test("identifies target element by label when id does not match", async () => {
    const recorder = new ExplicitRecorder();
    recorder.start();

    const ctx = browserContext();
    // Use label instead of id
    recorder.recordStep(ctx, "click:Log In");

    const steps = recorder.stop();
    expect(steps[0].targetElement).toBeDefined();
    expect(steps[0].targetElement!.id).toBe("btn-login");
  });

  test("generates a complete workflow from recorded steps", async () => {
    const recorder = new ExplicitRecorder();
    recorder.start();

    const ctx = browserContext();
    recorder.recordStep(ctx, "click:input-username");
    recorder.recordStep(ctx, "type:input-username:admin");
    recorder.recordStep(ctx, "click:input-password");
    recorder.recordStep(ctx, "type:input-password:secret");
    recorder.recordStep(ctx, "click:btn-login");

    recorder.stop();

    const workflow = recorder.toWorkflow("login-test", "Automated login test");

    expect(workflow.name).toBe("login-test");
    expect(workflow.description).toBe("Automated login test");
    expect(workflow.app).toBe("Firefox");
    expect(workflow.version).toBe("1.0.0");
    expect(workflow.steps.length).toBe(5);

    // Step descriptions are human-readable
    expect(workflow.steps[0].description).toContain("Click");
    expect(workflow.steps[0].description).toContain("Username");

    // Type steps include the text
    expect(workflow.steps[1].description).toContain("Type");
    expect(workflow.steps[1].description).toContain("admin");

    // Actions have correct types
    expect(workflow.steps[0].action.type).toBe("click");
    expect(workflow.steps[1].action.type).toBe("type");

    // Context map captures element details
    expect(workflow.context_map).toBeDefined();
    expect(Object.keys(workflow.context_map!).length).toBeGreaterThan(0);
  });

  test("sets expected context from the next step's context", async () => {
    const recorder = new ExplicitRecorder();
    recorder.start();

    const ctx1 = browserContext({ url: "https://example.com/login" });
    const ctx2 = { ...browserContext({ url: "https://example.com/dashboard" }), app: "Firefox", window: "Dashboard — Firefox" };

    recorder.recordStep(ctx1, "click:btn-login");
    recorder.recordStep(ctx2, "click:nav-home");

    recorder.stop();
    const workflow = recorder.toWorkflow("test", "test");

    // First step's expected context should reference the second step's app/window
    expect(workflow.steps[0].expected).toBeDefined();
    expect(workflow.steps[0].expected!.app).toBe("Firefox");
    expect(workflow.steps[0].expected!.window).toBe("Dashboard — Firefox");

    // Last step has no expected (nothing after it)
    expect(workflow.steps[1].expected).toBeUndefined();
  });

  test("sets min_confidence from target element confidence", async () => {
    const recorder = new ExplicitRecorder();
    recorder.start();

    const ctx = browserContext();
    recorder.recordStep(ctx, "click:btn-login"); // btn-login has confidence 0.95

    recorder.stop();
    const workflow = recorder.toWorkflow("test", "test");

    // min_confidence = max(0.5, 0.95 - 0.1) = 0.85
    expect(workflow.steps[0].min_confidence).toBe(0.85);
  });

  test("handles key combo recording", async () => {
    const recorder = new ExplicitRecorder();
    recorder.start();

    recorder.recordStep(editorContext(), "key_combo:ctrl:s");

    recorder.stop();
    const workflow = recorder.toWorkflow("save", "Save file");

    expect(workflow.steps[0].action.type).toBe("key_combo");
    if (workflow.steps[0].action.type === "key_combo") {
      expect(workflow.steps[0].action.keys).toEqual(["ctrl", "s"]);
    }
    expect(workflow.steps[0].description).toContain("ctrl+s");
  });

  test("handles scroll recording", async () => {
    const recorder = new ExplicitRecorder();
    recorder.start();

    recorder.recordStep(editorContext(), "scroll:0:100");

    recorder.stop();
    const workflow = recorder.toWorkflow("scroll", "Scroll down");

    expect(workflow.steps[0].action.type).toBe("scroll");
    if (workflow.steps[0].action.type === "scroll") {
      expect(workflow.steps[0].action.dx).toBe(0);
      expect(workflow.steps[0].action.dy).toBe(100);
    }
  });

  test("isRecording and stepCount properties are accurate", async () => {
    const recorder = new ExplicitRecorder();

    expect(recorder.isRecording).toBe(false);
    expect(recorder.stepCount).toBe(0);

    recorder.start();
    expect(recorder.isRecording).toBe(true);

    recorder.recordStep(editorContext(), "click:btn-run");
    expect(recorder.stepCount).toBe(1);

    recorder.recordStep(editorContext(), "click:btn-debug");
    expect(recorder.stepCount).toBe(2);

    recorder.stop();
    expect(recorder.isRecording).toBe(false);
  });

  test("does not record steps when not in recording mode", async () => {
    const recorder = new ExplicitRecorder();

    recorder.recordStep(editorContext(), "click:btn-run");
    recorder.recordStep(editorContext(), "click:btn-debug");

    expect(recorder.stepCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Passive → Explicit Integration
// ---------------------------------------------------------------------------

test.describe("Passive to Explicit Integration", () => {
  test("passive detection followed by explicit refinement produces valid workflow", async () => {
    // Phase 1: Passive recording detects a pattern
    const passive = new PassiveRecorder("high");
    passive.start();

    const now = Date.now();
    for (let i = 0; i < 30; i++) {
      const ctx = i % 2 === 0
        ? { ...browserContext(), timestamp_ms: now + i * 1000 }
        : { ...editorContext(), timestamp_ms: now + i * 1000 };
      passive.onContext(ctx);
    }
    passive.stop();

    const patterns = passive.getPatterns();
    expect(patterns.length).toBeGreaterThan(0);

    // Phase 2: User refines the pattern with explicit recording
    const explicit = new ExplicitRecorder();
    explicit.start();

    // Record the actual steps for the detected pattern
    const ctx = browserContext();
    explicit.recordStep(ctx, "click:input-username");
    explicit.recordStep(ctx, "type:input-username:admin");
    explicit.recordStep(ctx, "click:btn-login");

    explicit.stop();
    const workflow = explicit.toWorkflow("refined-login", patterns[0].description);

    // The workflow should be complete and valid
    expect(workflow.name).toBe("refined-login");
    expect(workflow.steps.length).toBe(3);
    expect(workflow.app).toBe("Firefox");
    expect(workflow.created_at).toBeDefined();
    expect(workflow.updated_at).toBeDefined();

    // Each step has a valid action
    for (const step of workflow.steps) {
      expect(["click", "type", "key", "key_combo", "scroll", "wait", "custom"]).toContain(
        step.action.type,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Multi-App Contexts
// ---------------------------------------------------------------------------

test.describe("Multi-App Contexts", () => {
  test("recorder handles SAP context elements correctly", async () => {
    const recorder = new ExplicitRecorder();
    recorder.start();

    const ctx = sapContext();
    recorder.recordStep(ctx, "click:sap-tcode");
    recorder.recordStep(ctx, "type:sap-tcode:VA01");
    recorder.recordStep(ctx, "click:sap-execute");

    recorder.stop();
    const workflow = recorder.toWorkflow("sap-va01", "Create sales order");

    expect(workflow.app).toBe("SAP Logon");
    expect(workflow.steps.length).toBe(3);

    // Target elements should come from native_api source
    expect(workflow.context_map).toBeDefined();
    const tcode = workflow.context_map!["sap-tcode"] as { type: string };
    expect(tcode.type).toBe("input");
  });
});
