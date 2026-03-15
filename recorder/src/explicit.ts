import type { ScreenContext, Workflow, WorkflowStep } from "@cellar/agent";

/** A recorded step with full context. */
export interface RecordedStep {
  context: ScreenContext;
  action: string;
  timestamp: Date;
}

/**
 * Explicit recorder — user-triggered recording mode.
 * Captures all five CEL streams at every step to build a workflow
 * with full context maps.
 */
export class ExplicitRecorder {
  private steps: RecordedStep[] = [];
  private recording = false;

  /** Start recording. */
  start(): void {
    this.recording = true;
    this.steps = [];
    // TODO: Signal CEL to capture all five streams at high fidelity
  }

  /** Stop recording and return the captured steps. */
  stop(): RecordedStep[] {
    this.recording = false;
    return [...this.steps];
  }

  /** Record a step (called by CEL on each user action during recording). */
  recordStep(context: ScreenContext, action: string): void {
    if (!this.recording) return;
    this.steps.push({ context, action, timestamp: new Date() });
  }

  /** Convert recorded steps to a workflow definition. */
  toWorkflow(name: string, description: string): Workflow {
    const steps: WorkflowStep[] = this.steps.map((s, i) => ({
      id: `step-${i}`,
      description: s.action,
      action: { type: "custom" as const, adapter: "", action: s.action, params: {} },
    }));

    return {
      name,
      description,
      app: this.steps[0]?.context.app ?? "unknown",
      version: "1.0.0",
      steps,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /** Whether currently recording. */
  get isRecording(): boolean {
    return this.recording;
  }
}
