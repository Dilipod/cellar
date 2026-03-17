import { describe, it, expect } from "vitest";
import { ContextFeed } from "./context-feed.js";
import type { ScreenContext } from "@cellar/agent";

function makeContext(confidence: number): ScreenContext {
  return {
    app: "TestApp",
    window: "Main",
    elements: [
      {
        id: "elem-1",
        element_type: "button",
        confidence,
        source: "accessibility_tree",
        state: { focused: false, enabled: true, visible: true, selected: false },
      },
    ],
    timestamp_ms: Date.now(),
  };
}

function makeEmptyContext(): ScreenContext {
  return {
    app: "TestApp",
    window: "Main",
    elements: [],
    timestamp_ms: Date.now(),
  };
}

describe("ContextFeed", () => {
  it("should record entries", () => {
    const feed = new ContextFeed();
    feed.record(makeContext(0.95), "Clicking button", "High confidence");
    const recent = feed.getRecent();
    expect(recent.length).toBe(1);
    expect(recent[0].agentIntent).toBe("Clicking button");
    expect(recent[0].agentReasoning).toBe("High confidence");
  });

  it("should classify high confidence (>= 0.9)", () => {
    const feed = new ContextFeed();
    const entry = feed.record(makeContext(0.95));
    expect(entry.confidenceLevel).toBe("high");
  });

  it("should classify medium confidence (0.7-0.9)", () => {
    const feed = new ContextFeed();
    const entry = feed.record(makeContext(0.8));
    expect(entry.confidenceLevel).toBe("medium");
  });

  it("should classify low confidence (0.5-0.7)", () => {
    const feed = new ContextFeed();
    const entry = feed.record(makeContext(0.6));
    expect(entry.confidenceLevel).toBe("low");
  });

  it("should classify paused confidence (< 0.5)", () => {
    const feed = new ContextFeed();
    const entry = feed.record(makeContext(0.3));
    expect(entry.confidenceLevel).toBe("paused");
  });

  it("should classify empty context as paused", () => {
    const feed = new ContextFeed();
    const entry = feed.record(makeEmptyContext());
    expect(entry.confidenceLevel).toBe("paused");
  });

  it("should respect getRecent count limit", () => {
    const feed = new ContextFeed();
    for (let i = 0; i < 10; i++) {
      feed.record(makeContext(0.9));
    }
    const recent = feed.getRecent(3);
    expect(recent.length).toBe(3);
  });

  it("should cap history at maxHistory", () => {
    const feed = new ContextFeed();
    // Record more than default maxHistory (1000)
    for (let i = 0; i < 1005; i++) {
      feed.record(makeContext(0.9));
    }
    const all = feed.getRecent(2000);
    expect(all.length).toBe(1000);
  });

  it("should include timestamp on entries", () => {
    const feed = new ContextFeed();
    const entry = feed.record(makeContext(0.9));
    expect(entry.timestamp).toBeInstanceOf(Date);
  });

  it("should record without optional intent/reasoning", () => {
    const feed = new ContextFeed();
    const entry = feed.record(makeContext(0.9));
    expect(entry.agentIntent).toBeUndefined();
    expect(entry.agentReasoning).toBeUndefined();
  });
});
