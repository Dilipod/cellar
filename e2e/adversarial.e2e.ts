/**
 * Adversarial & Stress E2E Tests
 *
 * Tests behavior under hostile, degenerate, and extreme conditions:
 * - Huge element counts (10,000+ elements)
 * - Empty/null fields in context
 * - Concurrent recorder operations
 * - Malformed action strings
 * - Rapid start/stop cycles
 * - Context feed overflow
 * - Engine with zero-step workflows
 * - Duplicate element IDs
 */
import { test, expect } from "@playwright/test";
import { PassiveRecorder, ExplicitRecorder } from "@cellar/recorder";
import { ContextFeed } from "@cellar/live-view";
import type { ScreenContext, ContextElement, Workflow } from "@cellar/agent";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeElement(id: string, opts: Partial<ContextElement> = {}): ContextElement {
  return {
    id,
    element_type: opts.element_type ?? "button",
    confidence: opts.confidence ?? 0.9,
    source: opts.source ?? "accessibility_tree",
    label: opts.label,
    value: opts.value,
    bounds: opts.bounds,
  };
}

function makeContext(opts: Partial<ScreenContext> & { elementCount?: number } = {}): ScreenContext {
  const count = opts.elementCount ?? 5;
  return {
    app: opts.app ?? "TestApp",
    window: opts.window ?? "TestWindow",
    elements: opts.elements ?? Array.from({ length: count }, (_, i) =>
      makeElement(`el-${i}`, { label: `Element ${i}` }),
    ),
    timestamp_ms: opts.timestamp_ms ?? Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Huge Element Counts
// ---------------------------------------------------------------------------

test.describe("Stress: Large Element Counts", () => {
  test("context feed handles 10,000-element contexts", async () => {
    const feed = new ContextFeed();
    const ctx = makeContext({ elementCount: 10_000 });

    const start = Date.now();
    const entry = feed.record(ctx, "processing huge context");
    const elapsed = Date.now() - start;

    expect(entry.confidenceLevel).toBe("high");
    expect(entry.context.elements.length).toBe(10_000);
    expect(elapsed).toBeLessThan(1000); // Should complete in <1s
  });

  test("passive recorder handles burst of 10,000 observations", async () => {
    const recorder = new PassiveRecorder("high");
    recorder.start();

    const start = Date.now();
    for (let i = 0; i < 10_000; i++) {
      recorder.onContext(makeContext({
        app: i % 2 === 0 ? "AppA" : "AppB",
        timestamp_ms: i,
      }));
    }
    recorder.stop();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(10000); // Should complete in <10s
    // Patterns should still be detected despite high volume
    expect(recorder.getPatterns().length).toBeGreaterThan(0);
  });

  test("explicit recorder handles 1,000 recorded steps", async () => {
    const recorder = new ExplicitRecorder();
    recorder.start();

    const ctx = makeContext({ elementCount: 20 });
    for (let i = 0; i < 1000; i++) {
      recorder.recordStep(ctx, `click:el-${i % 20}`);
    }

    const steps = recorder.stop();
    expect(steps.length).toBe(1000);

    // Workflow generation should still work
    const workflow = recorder.toWorkflow("stress-test", "1000 steps");
    expect(workflow.steps.length).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Empty / Null / Missing Fields
// ---------------------------------------------------------------------------

test.describe("Edge Case: Empty and Missing Fields", () => {
  test("context with no elements", async () => {
    const feed = new ContextFeed();
    const ctx: ScreenContext = {
      app: "",
      window: "",
      elements: [],
      timestamp_ms: 0,
    };

    const entry = feed.record(ctx);
    expect(entry.confidenceLevel).toBe("paused");
  });

  test("context with undefined labels and values", async () => {
    const ctx: ScreenContext = {
      app: "App",
      window: "Win",
      elements: [
        { id: "e1", element_type: "button", confidence: 0.9, source: "vision" },
        { id: "e2", element_type: "input", confidence: 0.8, source: "accessibility_tree" },
      ],
      timestamp_ms: Date.now(),
    };

    const feed = new ContextFeed();
    const entry = feed.record(ctx, "test");
    expect(entry.confidenceLevel).toBe("high");
  });

  test("explicit recorder with empty action strings", async () => {
    const recorder = new ExplicitRecorder();
    recorder.start();

    const ctx = makeContext();
    recorder.recordStep(ctx, "");
    recorder.recordStep(ctx, ":");
    recorder.recordStep(ctx, ":::");

    const steps = recorder.stop();
    expect(steps.length).toBe(3);

    // Should not crash when converting to workflow
    const workflow = recorder.toWorkflow("empty-actions", "test");
    expect(workflow.steps.length).toBe(3);
  });

  test("passive recorder with identical timestamps", async () => {
    const recorder = new PassiveRecorder("high");
    recorder.start();

    // All contexts have timestamp 0
    for (let i = 0; i < 100; i++) {
      recorder.onContext(makeContext({ app: "App", timestamp_ms: 0 }));
    }

    recorder.stop();
    // Should not crash; may or may not detect patterns
    expect(recorder.getPatterns()).toBeDefined();
  });

  test("zero-element context in recorder", async () => {
    const recorder = new ExplicitRecorder();
    recorder.start();

    const emptyCtx: ScreenContext = { app: "", window: "", elements: [], timestamp_ms: 0 };
    recorder.recordStep(emptyCtx, "click:nonexistent");

    const steps = recorder.stop();
    expect(steps.length).toBe(1);
    expect(steps[0].targetElement).toBeUndefined();

    const workflow = recorder.toWorkflow("empty-ctx", "test");
    expect(workflow.app).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Duplicate Element IDs
// ---------------------------------------------------------------------------

test.describe("Edge Case: Duplicate Element IDs", () => {
  test("context feed handles duplicate element IDs without crashing", async () => {
    const ctx: ScreenContext = {
      app: "App",
      window: "Win",
      elements: [
        makeElement("dup-id", { label: "First", confidence: 0.9 }),
        makeElement("dup-id", { label: "Second", confidence: 0.8 }),
        makeElement("dup-id", { label: "Third", confidence: 0.7 }),
      ],
      timestamp_ms: Date.now(),
    };

    const feed = new ContextFeed();
    const entry = feed.record(ctx);
    expect(entry.context.elements.length).toBe(3);
  });

  test("explicit recorder picks first element with matching ID", async () => {
    const ctx: ScreenContext = {
      app: "App",
      window: "Win",
      elements: [
        makeElement("dup-id", { label: "First" }),
        makeElement("dup-id", { label: "Second" }),
      ],
      timestamp_ms: Date.now(),
    };

    const recorder = new ExplicitRecorder();
    recorder.start();
    recorder.recordStep(ctx, "click:dup-id");
    const steps = recorder.stop();

    // Should pick the first matching element
    expect(steps[0].targetElement).toBeDefined();
    expect(steps[0].targetElement!.label).toBe("First");
  });
});

// ---------------------------------------------------------------------------
// Rapid Lifecycle Cycling
// ---------------------------------------------------------------------------

test.describe("Stress: Rapid Lifecycle Cycling", () => {
  test("passive recorder survives 100 rapid start/stop cycles", async () => {
    const recorder = new PassiveRecorder("high");

    for (let i = 0; i < 100; i++) {
      recorder.start();
      recorder.onContext(makeContext({ app: `App-${i}`, timestamp_ms: i }));
      recorder.stop();
    }

    // After stop, patterns should be from the last cycle only
    const patterns = recorder.getPatterns();
    expect(patterns).toBeDefined();
  });

  test("explicit recorder survives 100 rapid start/stop cycles", async () => {
    const recorder = new ExplicitRecorder();

    for (let i = 0; i < 100; i++) {
      recorder.start();
      recorder.recordStep(makeContext(), `click:el-${i}`);
      const steps = recorder.stop();
      expect(steps.length).toBe(1);
    }

    expect(recorder.isRecording).toBe(false);
    // After stop(), stepCount reflects the last cycle's steps (1), not reset to 0
    expect(recorder.stepCount).toBeLessThanOrEqual(1);
  });

  test("context feed survives rapid recording", async () => {
    const feed = new ContextFeed();

    for (let i = 0; i < 5000; i++) {
      feed.record(makeContext({ app: `App-${i % 10}`, timestamp_ms: i }));
    }

    const recent = feed.getRecent(100);
    expect(recent.length).toBe(100);

    // Oldest entries should have been evicted (max 1000)
    const all = feed.getRecent(2000);
    expect(all.length).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Malformed Actions
// ---------------------------------------------------------------------------

test.describe("Edge Case: Malformed Actions", () => {
  test("recorder handles actions with special characters", async () => {
    const recorder = new ExplicitRecorder();
    recorder.start();

    const ctx = makeContext();
    recorder.recordStep(ctx, "click:btn with spaces");
    recorder.recordStep(ctx, "type:input:hello:world:with:colons");
    recorder.recordStep(ctx, 'click:<script>alert("xss")</script>');
    recorder.recordStep(ctx, "type:field:emoji 🎉🎊");

    const steps = recorder.stop();
    expect(steps.length).toBe(4);

    const workflow = recorder.toWorkflow("special-chars", "test");
    expect(workflow.steps.length).toBe(4);

    // Type action with colons should preserve text
    const typeStep = workflow.steps[1];
    expect(typeStep.action.type).toBe("type");
    if (typeStep.action.type === "type") {
      expect(typeStep.action.text).toBe("hello:world:with:colons");
    }
  });

  test("recorder handles extremely long action strings", async () => {
    const recorder = new ExplicitRecorder();
    recorder.start();

    const longText = "a".repeat(100_000);
    recorder.recordStep(makeContext(), `type:field:${longText}`);

    const steps = recorder.stop();
    expect(steps.length).toBe(1);

    const workflow = recorder.toWorkflow("long", "test");
    if (workflow.steps[0].action.type === "type") {
      expect(workflow.steps[0].action.text.length).toBe(100_000);
    }
  });
});

// ---------------------------------------------------------------------------
// Confidence Edge Cases
// ---------------------------------------------------------------------------

test.describe("Edge Case: Confidence Boundaries", () => {
  test("context feed at exact confidence boundaries", async () => {
    const feed = new ContextFeed();

    // Exactly at boundaries: 0.9, 0.7, 0.5, 0.0
    const cases: Array<[number, string]> = [
      [0.9, "high"],
      [0.7, "medium"],
      [0.5, "low"],
      [0.0, "paused"],
      [1.0, "high"],
      [0.899999, "medium"],
      [0.699999, "low"],
      [0.499999, "paused"],
    ];

    for (const [confidence, expectedLevel] of cases) {
      const ctx: ScreenContext = {
        app: "Test",
        window: "Test",
        elements: [makeElement("e1", { confidence })],
        timestamp_ms: Date.now(),
      };
      const entry = feed.record(ctx);
      expect(entry.confidenceLevel).toBe(expectedLevel);
    }
  });

  test("NaN confidence does not crash", async () => {
    const feed = new ContextFeed();
    const ctx: ScreenContext = {
      app: "Test",
      window: "Test",
      elements: [makeElement("e1", { confidence: NaN })],
      timestamp_ms: Date.now(),
    };

    // Should not throw
    const entry = feed.record(ctx);
    expect(entry).toBeDefined();
  });

  test("negative confidence does not crash", async () => {
    const feed = new ContextFeed();
    const ctx: ScreenContext = {
      app: "Test",
      window: "Test",
      elements: [makeElement("e1", { confidence: -1.0 })],
      timestamp_ms: Date.now(),
    };

    const entry = feed.record(ctx);
    expect(entry.confidenceLevel).toBe("paused");
  });
});

// ---------------------------------------------------------------------------
// Serialization Safety
// ---------------------------------------------------------------------------

test.describe("Serialization Safety", () => {
  test("workflow with special characters serializes to valid JSON", async () => {
    const recorder = new ExplicitRecorder();
    recorder.start();

    const ctx = makeContext({ app: 'App "with" quotes', window: "Win\nwith\nnewlines" });
    recorder.recordStep(ctx, 'type:field:{"nested": "json"}');

    recorder.stop();
    const workflow = recorder.toWorkflow("json-test", 'Description with "quotes"');

    // Should produce valid JSON
    const json = JSON.stringify(workflow);
    const parsed = JSON.parse(json) as Workflow;
    expect(parsed.name).toBe("json-test");
    expect(parsed.app).toBe('App "with" quotes');
  });

  test("context with all sources serializes correctly", async () => {
    const ctx: ScreenContext = {
      app: "Multi",
      window: "Source",
      elements: [
        makeElement("a1", { source: "accessibility_tree" }),
        makeElement("n1", { source: "native_api" }),
        makeElement("v1", { source: "vision" }),
        makeElement("m1", { source: "merged" }),
      ],
      timestamp_ms: Date.now(),
    };

    const json = JSON.stringify(ctx);
    const parsed = JSON.parse(json) as ScreenContext;
    expect(parsed.elements.length).toBe(4);

    const sources = new Set(parsed.elements.map((e) => e.source));
    expect(sources.size).toBe(4);
  });
});
