import type { ScreenContext } from "@cellar/agent";

/** A context feed entry with agent reasoning. */
export interface ContextFeedEntry {
  timestamp: Date;
  context: ScreenContext;
  agentIntent?: string;
  agentReasoning?: string;
  confidenceLevel: "high" | "medium" | "low" | "paused";
}

/**
 * Context feed — streams what the agent sees and decides in real-time.
 * This is the "why", not just the "what".
 */
export class ContextFeed {
  private history: ContextFeedEntry[] = [];
  private maxHistory = 1000;

  /** Record a context snapshot with agent reasoning. */
  record(
    context: ScreenContext,
    intent?: string,
    reasoning?: string
  ): ContextFeedEntry {
    const maxConfidence = Math.max(
      ...context.elements.map((e) => e.confidence),
      0
    );
    const confidenceLevel =
      maxConfidence >= 0.9
        ? "high"
        : maxConfidence >= 0.7
          ? "medium"
          : maxConfidence >= 0.5
            ? "low"
            : "paused";

    const entry: ContextFeedEntry = {
      timestamp: new Date(),
      context,
      agentIntent: intent,
      agentReasoning: reasoning,
      confidenceLevel,
    };

    this.history.push(entry);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    return entry;
  }

  /** Get recent feed entries. */
  getRecent(count = 50): ContextFeedEntry[] {
    return this.history.slice(-count);
  }
}
