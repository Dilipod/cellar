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
 * - Cross-context consistency
 * - Bounds and label quality
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

  test("bounds do not overlap unreasonably within same context", async () => {
    const ctx = browserContext();
    const withBounds = ctx.elements.filter(e => e.bounds);
    // No two sibling-level elements should be in the exact same position
    for (let i = 0; i < withBounds.length; i++) {
      for (let j = i + 1; j < withBounds.length; j++) {
        const a = withBounds[i].bounds!;
        const b = withBounds[j].bounds!;
        // Exact duplicate position = suspicious
        const exactDup = a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
        if (exactDup) {
          // Only containers (window, group) are allowed to share bounds with children
          const containerTypes = ["window", "group", "tab", "list", "menu"];
          const aContainer = containerTypes.includes(withBounds[i].element_type);
          const bContainer = containerTypes.includes(withBounds[j].element_type);
          expect(
            aContainer || bContainer,
            `Non-container elements "${withBounds[i].id}" and "${withBounds[j].id}" have identical bounds`
          ).toBe(true);
        }
      }
    }
  });

  test("interactive elements have reasonable bounds sizes", async () => {
    const ctx = browserContext();
    const actionable = ctx.elements.filter(e =>
      ["button", "input", "link", "checkbox"].includes(e.element_type) && e.bounds
    );
    expect(actionable.length).toBeGreaterThan(0);
    for (const el of actionable) {
      // Buttons/inputs should be at least 10x10 and not larger than screen
      expect(el.bounds!.width).toBeGreaterThanOrEqual(10);
      expect(el.bounds!.height).toBeGreaterThanOrEqual(10);
      expect(el.bounds!.width).toBeLessThan(5000);
      expect(el.bounds!.height).toBeLessThan(5000);
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

    // Vision confidence should generally be lower
    expect(maxVision).toBeLessThanOrEqual(0.85);
  });

  test("confidence ordering is consistent with source hierarchy", async () => {
    // native_api >= accessibility_tree >= vision (on average)
    const sapCtx = sapContext();
    const edCtx = editorContext();
    const visCtx = visionEnrichedContext();

    const avgNative = mean(sapCtx.elements.map(e => e.confidence));
    const avgA11y = mean(edCtx.elements.map(e => e.confidence));
    const visionOnly = visCtx.elements.filter(e => e.source === "vision");
    const avgVision = mean(visionOnly.map(e => e.confidence));

    expect(avgNative).toBeGreaterThanOrEqual(avgA11y);
    expect(avgA11y).toBeGreaterThan(avgVision);
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

  test("source types are exhaustive — no unknown sources across all fixtures", async () => {
    const allContexts = [
      editorContext(), browserContext(), sapContext(),
      sparseContext(), visionEnrichedContext(), emptyContext(),
    ];
    const validSources = new Set(["accessibility_tree", "native_api", "vision", "merged"]);
    for (const ctx of allContexts) {
      for (const el of ctx.elements) {
        expect(validSources.has(el.source)).toBe(true);
      }
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
      expect(el.bounds!.width).toBeGreaterThanOrEqual(50);
      expect(el.bounds!.height).toBeGreaterThanOrEqual(20);
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

  test("vision elements don't duplicate existing a11y elements", async () => {
    const ctx = visionEnrichedContext();
    const a11yLabels = ctx.elements
      .filter(e => e.source === "accessibility_tree" && e.label)
      .map(e => e.label!);
    const visionLabels = ctx.elements
      .filter(e => e.source === "vision" && e.label)
      .map(e => e.label!);

    // Vision should add NEW elements, not duplicate existing ones
    for (const vl of visionLabels) {
      // If there's overlap, it should be from genuinely different screen areas
      if (a11yLabels.includes(vl)) {
        const a11yEl = ctx.elements.find(e => e.source === "accessibility_tree" && e.label === vl)!;
        const visionEl = ctx.elements.find(e => e.source === "vision" && e.label === vl)!;
        // If same label, bounds must be significantly different
        if (a11yEl.bounds && visionEl.bounds) {
          const samePosition =
            Math.abs(a11yEl.bounds.x - visionEl.bounds.x) < 5 &&
            Math.abs(a11yEl.bounds.y - visionEl.bounds.y) < 5;
          expect(samePosition).toBe(false);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Context Feed Integration
// ---------------------------------------------------------------------------

test.describe("Context Feed", () => {
  test("records context with correct confidence level mapping", async () => {
    const feed = new ContextFeed();

    const highCtx = editorContext();
    const highEntry = feed.record(highCtx, "clicking run button", "button identified with high confidence");
    expect(highEntry.confidenceLevel).toBe("high");
    expect(highEntry.agentIntent).toBe("clicking run button");
    expect(highEntry.agentReasoning).toBe("button identified with high confidence");

    const lowCtx: ScreenContext = {
      app: "Test", window: "Test",
      elements: [{ id: "el1", element_type: "text", confidence: 0.55, source: "vision" }],
      timestamp_ms: Date.now(),
    };
    const lowEntry = feed.record(lowCtx);
    expect(lowEntry.confidenceLevel).toBe("low");

    const pausedCtx: ScreenContext = {
      app: "Test", window: "Test",
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

  test("eviction removes oldest entries first (FIFO)", async () => {
    const feed = new ContextFeed();

    // Record 1005 entries with distinguishable apps
    for (let i = 0; i < 1005; i++) {
      const ctx: ScreenContext = {
        app: `App-${i}`,
        window: "Win",
        elements: [{ id: "e1", element_type: "text", confidence: 0.9, source: "accessibility_tree" }],
        timestamp_ms: i,
      };
      feed.record(ctx);
    }

    const all = feed.getRecent(2000);
    expect(all.length).toBe(1000);
    // Oldest 5 should have been evicted — first entry should be App-5
    expect(all[0].context.app).toBe("App-5");
    expect(all[999].context.app).toBe("App-1004");
  });

  test("empty context produces 'paused' confidence level", async () => {
    const feed = new ContextFeed();
    const entry = feed.record(emptyContext());
    expect(entry.confidenceLevel).toBe("paused");
  });

  test("medium confidence level for elements between 0.7 and 0.9", async () => {
    const feed = new ContextFeed();

    const ctx: ScreenContext = {
      app: "Test", window: "Test",
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

    expect(ctx.timestamp_ms).toBeGreaterThan(now - 1000);
    expect(ctx.timestamp_ms).toBeLessThanOrEqual(now + 100);
  });

  test("context contains expected element mix for real app scenarios", async () => {
    // Editor should have menus, buttons, inputs, tabs
    const editor = editorContext();
    const edTypes = new Set(editor.elements.map(e => e.element_type));
    expect(edTypes.has("menu")).toBe(true);
    expect(edTypes.has("button")).toBe(true);
    expect(edTypes.has("input")).toBe(true);
    expect(edTypes.has("tab_item")).toBe(true);

    // Browser should have links, inputs, buttons
    const browser = browserContext();
    const brTypes = new Set(browser.elements.map(e => e.element_type));
    expect(brTypes.has("link")).toBe(true);
    expect(brTypes.has("input")).toBe(true);
    expect(brTypes.has("button")).toBe(true);

    // SAP should have tree, menu, input, button
    const sap = sapContext();
    const sapTypes = new Set(sap.elements.map(e => e.element_type));
    expect(sapTypes.has("tree_view")).toBe(true);
    expect(sapTypes.has("input")).toBe(true);
    expect(sapTypes.has("button")).toBe(true);
  });

  test("all interactive elements have bounds for click targeting", async () => {
    const contexts = [browserContext(), editorContext(), sapContext()];
    const interactiveTypes = ["button", "input", "link", "checkbox"];

    for (const ctx of contexts) {
      const interactive = ctx.elements.filter(e => interactiveTypes.includes(e.element_type));
      for (const el of interactive) {
        expect(
          el.bounds,
          `Interactive element "${el.id}" (${el.element_type}) in ${ctx.app} has no bounds — cannot be clicked`
        ).toBeDefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Cross-Context Consistency
// ---------------------------------------------------------------------------

test.describe("Cross-Context Consistency", () => {
  test("same factory produces structurally consistent contexts", async () => {
    const ctx1 = editorContext();
    const ctx2 = editorContext();

    // Same structure (not necessarily same timestamp)
    expect(ctx1.app).toBe(ctx2.app);
    expect(ctx1.window).toBe(ctx2.window);
    expect(ctx1.elements.length).toBe(ctx2.elements.length);

    // Same element IDs in same order
    for (let i = 0; i < ctx1.elements.length; i++) {
      expect(ctx1.elements[i].id).toBe(ctx2.elements[i].id);
      expect(ctx1.elements[i].element_type).toBe(ctx2.elements[i].element_type);
    }
  });

  test("modified=true changes window title", async () => {
    const clean = editorContext({ modified: false });
    const dirty = editorContext({ modified: true });

    expect(clean.window).not.toContain("*");
    expect(dirty.window).toContain("*");
    // Elements should be same structure regardless of modified state
    expect(clean.elements.length).toBe(dirty.elements.length);
  });

  test("formVisible=false removes form elements", async () => {
    const withForm = browserContext({ formVisible: true });
    const noForm = browserContext({ formVisible: false });

    expect(withForm.elements.length).toBeGreaterThan(noForm.elements.length);
    // Without form, should not have username/password inputs
    expect(noForm.elements.find(e => e.id === "input-username")).toBeUndefined();
    expect(noForm.elements.find(e => e.id === "input-password")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mean(values: number[]): number {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}
