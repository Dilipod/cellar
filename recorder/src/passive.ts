import type { ScreenContext, Workflow } from "@cellar/agent";

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

/**
 * Passive recorder — silently observes user actions and detects
 * repeated patterns that could be automated.
 */
export class PassiveRecorder {
  private patterns: DetectedPattern[] = [];
  private recording = false;

  constructor(private frequency: ObservationFrequency = "low") {}

  /** Start passive observation. */
  start(): void {
    this.recording = true;
    // TODO: Subscribe to CEL input events and context changes
  }

  /** Stop passive observation. */
  stop(): void {
    this.recording = false;
  }

  /** Process a context snapshot (called periodically by CEL). */
  onContext(_context: ScreenContext): void {
    if (!this.recording) return;
    // TODO: Pattern detection logic
    // - Track sequences of actions
    // - Detect repetitions
    // - Build candidate workflows
  }

  /** Get detected patterns. */
  getPatterns(): DetectedPattern[] {
    return [...this.patterns];
  }

  /** Convert a detected pattern to a workflow draft. */
  toWorkflowDraft(_pattern: DetectedPattern): Partial<Workflow> {
    // TODO: Convert action sequence to workflow steps
    return {
      name: "untitled",
      description: "Auto-detected pattern",
      steps: [],
    };
  }

  /** Set observation frequency. */
  setFrequency(freq: ObservationFrequency): void {
    this.frequency = freq;
  }
}
