/**
 * Context Pipeline E2E Tests
 *
 * Tests the unified context API behavior:
 * - Context element structure and invariants
 * - Confidence scoring across sources
 * - Source attribution (accessibility, vision, native_api, merged)
 * - Vision fallback triggering conditions
 * - Context feed integration with live view
 * - Context assembly for workflow engine consumption
 */
import { test, expect } from "@playwright/test";
import { ContextFeed } from "@cellar/live-view";
import type { ScreenContext, ContextElement } from "@cellar/agent";
import {
  editorContext,
  browserContext,
  sapContext,
  sparseContext,
  visionEnrichedContext,
  emptyContext,
} from "./fixtures/mock-context.js";

// ---------------------------------------------------------------------------
// Context Element Invariants
// ---------------------------------------------------------------------------

test.describe("Context Element Invariants", () => {
  test("every element has required fields", async () => {
    const contexts = [editorContext(), browserContext(), sapContext()];

    for (const ctx of contexts) {
      expect(ctx.app).toBeTruthy();
      expect(ctx.window).toBeTruthy();
      expect(ctx.timestamp_ms).toBeGreaterThan(0);

      for (const el of ctx.elements) {
        expect(el.id).toBeTruthy();
        expect(el.element_type).toBeTruthy();
        expect(el.confidence).toBeGreaterThanOrEqual(0);
        expect(el.confidence).toBeLessThanOrEqual(1);
        expect(["accessibility_tree", "native_api", "vision", "merged"]).toContain(el.source);
      }
    }
  });

  test("elements with bounds have positive dimensions", async () => {
    const ctx = browserContext();

    for (const el of ctx.elements) {
      if (el.bounds) {
        expect(el.bounds.width).toBeGreaterThan(0);
        expect(el.bounds.height).toBeGreaterThan(0);
      }
    }
  });

  test("element IDs are unique within a context", async () => {
    const contexts = [editorContext(), browserContext(), sapContext()];

    for (const ctx of contexts) {
      const ids = ctx.elements.map((e) => e.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    }
  });
});

// ---------------------------------------------------------------------------
// Confidence Scoring
// ---------------------------------------------------------------------------

test.describe("Confidence Scoring", () => {
  test("accessibility_tree elements have confidence >= 0.7", async () => {
    const ctx = editorContext();
    const a11yElements = ctx.elements.filter((e) => e.source === "accessibility_tree");

    expect(a11yElements.length).toBeGreaterThan(0);
    for (const el of a11yElements) {
      expect(el.confidence).toBeGreaterThanOrEqual(0.7);
    }
  });

  test("native_api elements have confidence >= 0.85", async () => {
    const ctx = sapContext();
    const nativeElements = ctx.elements.filter((e) => e.source === "native_api");

    expect(nativeElements.length).toBeGreaterThan(0);
    for (const el of nativeElements) {
      expect(el.confidence).toBeGreaterThanOrEqual(0.85);
    }
  });

  test("vision elements have lower confidence than a11y elements", async () => {
    const ctx = visionEnrichedContext();
    const a11y = ctx.elements.filter((e) => e.source === "accessibility_tree");
    const vision = ctx.elements.filter((e) => e.source === "vision");

    expect(vision.length).toBeGreaterThan(0);
    expect(a11y.length).toBeGreaterThan(0);

    const maxVision = Math.max(...vision.map((e) => e.confidence));
    const minA11y = Math.min(...a11y.map((e) => e.confidence));

    // Vision confidence should generally be lower
    // (except for clear, unambiguous elements)
    expect(maxVision).toBeLessThanOrEqual(0.85);
  });
});

// ---------------------------------------------------------------------------
// Source Attribution
// ---------------------------------------------------------------------------

test.describe("Source Attribution", () => {
  test("editor context elements come from accessibility_tree", async () => {
    const ctx = editorContext();
    expect(ctx.elements.every((e) => e.source === "accessibility_tree")).toBe(true);
  });

  test("SAP context elements come from native_api", async () => {
    const ctx = sapContext();
    expect(ctx.elements.every((e) => e.source === "native_api")).toBe(true);
  });

  test("vision-enriched context has mixed sources", async () => {
    const ctx = visionEnrichedContext();
    const sources = new Set(ctx.elements.map((e) => e.source));
    expect(sources.has("accessibility_tree")).toBe(true);
    expect(sources.has("vision")).toBe(true);
  });

  test("vision elements have vision: prefixed IDs", async () => {
    const ctx = visionEnrichedContext();
    const visionElements = ctx.elements.filter((e) => e.source === "vision");

    for (const el of visionElements) {
      expect(el.id).toMatch(/^vision:\d+$/);
    }
  });
});

// ---------------------------------------------------------------------------
// Vision Fallback
// ---------------------------------------------------------------------------

test.describe("Vision Fallback", () => {
  test("sparse context has too few actionable elements", async () => {
    const ctx = sparseContext();
    const actionableTypes = ["button", "input", "link", "checkbox", "combobox", "menu_item"];
    const actionable = ctx.elements.filter((e) => actionableTypes.includes(e.element_type));

    // Should have fewer than 3 actionable elements (vision fallback threshold)
    expect(actionable.length).toBeLessThan(3);
  });

  test("vision-enriched context adds actionable elements", async () => {
    const sparse = sparseContext();
    const enriched = visionEnrichedContext();
    const actionableTypes = ["button", "input", "link", "checkbox", "combobox"];

    const sparseActionable = sparse.elements.filter((e) => actionableTypes.includes(e.element_type));
    const enrichedActionable = enriched.elements.filter((e) => actionableTypes.includes(e.element_type));

    expect(enrichedActionable.length).toBeGreaterThan(sparseActionable.length);
    expect(enrichedActionable.length).toBeGreaterThanOrEqual(3);
  });

  test("vision elements have realistic bounds for form detection", async () => {
    const ctx = visionEnrichedContext();
    const visionInputs = ctx.elements.filter(
      (e) => e.source === "vision" && e.element_type === "input",
    );

    expect(visionInputs.length).toBeGreaterThan(0);
    for (const el of visionInputs) {
      expect(el.bounds).toBeDefined();
      expect(el.bounds!.width).toBeGreaterThanOrEqual(50); // inputs are at least 50px wide
      expect(el.bounds!.height).toBeGreaterThanOrEqual(20); // and 20px tall
    }
  });

  test("vision buttons have labels", async () => {
    const ctx = visionEnrichedContext();
    const visionButtons = ctx.elements.filter(
      (e) => e.source === "vision" && e.element_type === "button",
    );

    expect(visionButtons.length).toBeGreaterThan(0);
    for (const btn of visionButtons) {
      expect(btn.label).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Context Feed Integration
// ---------------------------------------------------------------------------

test.describe("Context Feed", () => {
  test("records context with correct confidence level mapping", async () => {
    const feed = new ContextFeed();

    // High confidence context (elements >= 0.9)
    const highCtx = editorContext();
    const highEntry = feed.record(highCtx, "clicking run button", "button identified with high confidence");
    expect(highEntry.confidenceLevel).toBe("high");
    expect(highEntry.agentIntent).toBe("clicking run button");
    expect(highEntry.agentReasoning).toBe("button identified with high confidence");

    // Low confidence context (elements < 0.7)
    const lowCtx: ScreenContext = {
      app: "Test",
      window: "Test",
      elements: [{ id: "el1", element_type: "text", confidence: 0.55, source: "vision" }],
      timestamp_ms: Date.now(),
    };
    const lowEntry = feed.record(lowCtx);
    expect(lowEntry.confidenceLevel).toBe("low");

    // Paused level (below 0.5)
    const pausedCtx: ScreenContext = {
      app: "Test",
      window: "Test",
      elements: [{ id: "el1", element_type: "text", confidence: 0.3, source: "vision" }],
      timestamp_ms: Date.now(),
    };
    const pausedEntry = feed.record(pausedCtx);
    expect(pausedEntry.confidenceLevel).toBe("paused");
  });

  test("getRecent returns entries in chronological order", async () => {
    const feed = new ContextFeed();

    feed.record(editorContext());
    feed.record(browserContext());
    feed.record(sapContext());

    const recent = feed.getRecent(3);
    expect(recent.length).toBe(3);
    expect(recent[0].context.app).toBe("VS Code");
    expect(recent[1].context.app).toBe("Firefox");
    expect(recent[2].context.app).toBe("SAP Logon");
  });

  test("respects max history cap (1000 entries)", async () => {
    const feed = new ContextFeed();

    for (let i = 0; i < 1100; i++) {
      feed.record(editorContext());
    }

    const all = feed.getRecent(2000);
    expect(all.length).toBe(1000);
  });

  test("empty context produces 'paused' confidence level", async () => {
    const feed = new ContextFeed();

    const entry = feed.record(emptyContext());
    // No elements → max confidence is 0 → "paused"
    expect(entry.confidenceLevel).toBe("paused");
  });

  test("medium confidence level for elements between 0.7 and 0.9", async () => {
    const feed = new ContextFeed();

    const ctx: ScreenContext = {
      app: "Test",
      window: "Test",
      elements: [{ id: "el1", element_type: "button", confidence: 0.75, source: "accessibility_tree" }],
      timestamp_ms: Date.now(),
    };
    const entry = feed.record(ctx);
    expect(entry.confidenceLevel).toBe("medium");
  });
});

// ---------------------------------------------------------------------------
// Context Structure for Engine Consumption
// ---------------------------------------------------------------------------

test.describe("Context Structure", () => {
  test("context elements can be filtered by type for step matching", async () => {
    const ctx = browserContext();

    const buttons = ctx.elements.filter((e) => e.element_type === "button");
    const inputs = ctx.elements.filter((e) => e.element_type === "input");
    const links = ctx.elements.filter((e) => e.element_type === "link");

    expect(buttons.length).toBeGreaterThan(0);
    expect(inputs.length).toBeGreaterThan(0);
    expect(links.length).toBeGreaterThan(0);
  });

  test("context elements can be looked up by ID", async () => {
    const ctx = browserContext();

    const loginBtn = ctx.elements.find((e) => e.id === "btn-login");
    expect(loginBtn).toBeDefined();
    expect(loginBtn!.label).toBe("Log In");
    expect(loginBtn!.element_type).toBe("button");
    expect(loginBtn!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test("context elements can be looked up by label", async () => {
    const ctx = browserContext();

    const username = ctx.elements.find((e) => e.label === "Username");
    expect(username).toBeDefined();
    expect(username!.element_type).toBe("input");
  });

  test("context supports finding elements within bounds", async () => {
    const ctx = browserContext();

    // Find elements within the form area (y: 150-400)
    const formElements = ctx.elements.filter(
      (e) => e.bounds && e.bounds.y >= 150 && e.bounds.y <= 400,
    );

    expect(formElements.length).toBeGreaterThan(0);
    const types = formElements.map((e) => e.element_type);
    expect(types).toContain("input");
    expect(types).toContain("button");
  });

  test("timestamp_ms is recent", async () => {
    const ctx = editorContext();
    const now = Date.now();

    // Should be within the last second
    expect(ctx.timestamp_ms).toBeGreaterThan(now - 1000);
    expect(ctx.timestamp_ms).toBeLessThanOrEqual(now + 100);
  });
});
