import type { ScreenContext, Workflow, WorkflowStep, WorkflowAction } from "@cellar/agent";

/** Frequency of passive observation suggestions. */
export type ObservationFrequency = "low" | "medium" | "high";

/** A detected repeated pattern. */
export interface DetectedPattern {
  description: string;
  occurrences: number;
  firstSeen: Date;
  lastSeen: Date;
  steps: string[];
}

/** An observed action (internal tracking). */
interface ObservedAction {
  app: string;
  window: string;
  elementCount: number;
  timestamp: number;
}

/**
 * Passive recorder — silently observes context snapshots and detects
 * repeated patterns that could be automated.
 *
 * Pattern detection works by:
 * 1. Tracking context transitions (app/window changes)
 * 2. Detecting repeated app-switch sequences
 * 3. Identifying repetitive element interactions
 */
export class PassiveRecorder {
  private patterns: DetectedPattern[] = [];
  private recording = false;
  private history: ObservedAction[] = [];
  private frequency: ObservationFrequency;
  private maxHistory = 1000;

  constructor(frequency: ObservationFrequency = "low") {
    this.frequency = frequency;
  }

  /** Start passive observation. */
  start(): void {
    this.recording = true;
    this.history = [];
    this.patterns = [];
  }

  /** Stop passive observation. */
  stop(): void {
    this.recording = false;
    // Run final pattern detection
    this.detectPatterns();
  }

  /** Process a context snapshot (called periodically by CEL). */
  onContext(context: ScreenContext): void {
    if (!this.recording) return;

    this.history.push({
      app: context.app,
      window: context.window,
      elementCount: context.elements.length,
      timestamp: context.timestamp_ms,
    });

    // Cap history size
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    // Run pattern detection periodically based on frequency
    const interval = this.frequency === "high" ? 10 : this.frequency === "medium" ? 25 : 50;
    if (this.history.length % interval === 0) {
      this.detectPatterns();
    }
  }

  /** Get detected patterns. */
  getPatterns(): DetectedPattern[] {
    return [...this.patterns];
  }

  /** Convert a detected pattern to a workflow draft. */
  toWorkflowDraft(pattern: DetectedPattern): Partial<Workflow> {
    const steps: WorkflowStep[] = pattern.steps.map((desc, i) => {
      const action = parseActionDescription(desc);
      return {
        id: `step-${i}`,
        description: desc,
        action,
      };
    });

    return {
      name: "untitled",
      description: `Auto-detected pattern: ${pattern.description}`,
      steps,
    };
  }

  /** Set observation frequency. */
  setFrequency(freq: ObservationFrequency): void {
    this.frequency = freq;
  }

  /** Detect patterns from the observed history. */
  private detectPatterns(): void {
    this.patterns = [];

    // Pattern 1: App-switch sequences
    this.detectAppSwitchPatterns();

    // Pattern 2: Repeated app usage bursts
    this.detectAppBurstPatterns();
  }

  /** Detect repeated app-switching sequences (A→B→A→B = copy-paste pattern). */
  private detectAppSwitchPatterns(): void {
    if (this.history.length < 4) return;

    // Extract app transition sequence (deduplicate consecutive same-app entries)
    const transitions: string[] = [];
    let lastApp = "";
    for (const action of this.history) {
      if (action.app && action.app !== lastApp) {
        transitions.push(action.app);
        lastApp = action.app;
      }
    }

    // Look for repeated subsequences of length 2-4
    for (let seqLen = 2; seqLen <= Math.min(4, Math.floor(transitions.length / 2)); seqLen++) {
      const seen = new Map<string, { count: number; firstIdx: number; lastIdx: number }>();

      for (let i = 0; i <= transitions.length - seqLen; i++) {
        const key = transitions.slice(i, i + seqLen).join(" → ");
        const entry = seen.get(key);
        if (entry) {
          entry.count++;
          entry.lastIdx = i;
        } else {
          seen.set(key, { count: 1, firstIdx: i, lastIdx: i });
        }
      }

      for (const [key, info] of seen) {
        if (info.count >= 3) {
          const apps = key.split(" → ");
          this.patterns.push({
            description: `App switch: ${key}`,
            occurrences: info.count,
            firstSeen: new Date(this.history[info.firstIdx]?.timestamp ?? 0),
            lastSeen: new Date(this.history[info.lastIdx]?.timestamp ?? 0),
            steps: apps.map((app) => `Switch to ${app}`),
          });
        }
      }
    }
  }

  /** Detect apps used repeatedly in bursts (same app, many snapshots). */
  private detectAppBurstPatterns(): void {
    if (this.history.length < 10) return;

    const appCounts = new Map<string, number>();
    for (const action of this.history) {
      if (action.app) {
        appCounts.set(action.app, (appCounts.get(action.app) ?? 0) + 1);
      }
    }

    for (const [app, count] of appCounts) {
      const ratio = count / this.history.length;
      if (ratio > 0.5 && count > 10) {
        this.patterns.push({
          description: `Heavy usage of ${app}`,
          occurrences: count,
          firstSeen: new Date(this.history.find((h) => h.app === app)?.timestamp ?? 0),
          lastSeen: new Date(
            [...this.history].reverse().find((h) => h.app === app)?.timestamp ?? 0,
          ),
          steps: [`Work in ${app}`],
        });
      }
    }
  }
}

/** Parse a text description into a WorkflowAction. */
function parseActionDescription(desc: string): WorkflowAction {
  const lower = desc.toLowerCase();

  if (lower.startsWith("switch to ")) {
    return { type: "custom", adapter: "", action: "switch_app", params: { app: desc.slice(10) } };
  }
  if (lower.startsWith("click ")) {
    return { type: "click", target: desc.slice(6) };
  }
  if (lower.startsWith("type ")) {
    return { type: "type", target: "", text: desc.slice(5) };
  }
  if (lower.startsWith("press ") || lower.startsWith("key ")) {
    const key = desc.split(" ").slice(1).join("+");
    if (key.includes("+")) {
      return { type: "key_combo", keys: key.split("+") };
    }
    return { type: "key", key };
  }
  if (lower.startsWith("work in ")) {
    return { type: "custom", adapter: "", action: "work", params: { app: desc.slice(8) } };
  }

  return { type: "custom", adapter: "", action: desc, params: {} };
}
