import type {
  ScreenContext,
  ContextElement,
  Workflow,
  WorkflowStep,
  WorkflowAction,
} from "@cellar/agent";

/** A recorded step with full context. */
export interface RecordedStep {
  context: ScreenContext;
  action: string;
  timestamp: Date;
  /** The element that was interacted with, if identifiable. */
  targetElement?: ContextElement;
}

/**
 * Explicit recorder — user-triggered recording mode.
 * Captures context at every step and builds a workflow with
 * proper action types and context maps.
 */
export class ExplicitRecorder {
  private steps: RecordedStep[] = [];
  private recording = false;

  /** Start recording. */
  start(): void {
    this.recording = true;
    this.steps = [];
  }

  /** Stop recording and return the captured steps. */
  stop(): RecordedStep[] {
    this.recording = false;
    return [...this.steps];
  }

  /** Record a step (called by CEL on each user action during recording). */
  recordStep(context: ScreenContext, action: string): void {
    if (!this.recording) return;

    // Try to identify the target element from the action string
    const targetElement = identifyTarget(context, action);

    this.steps.push({ context, action, timestamp: new Date(), targetElement });
  }

  /** Convert recorded steps to a workflow definition. */
  toWorkflow(name: string, description: string): Workflow {
    const steps: WorkflowStep[] = this.steps.map((s, i) => ({
      id: `step-${i}`,
      description: describeStep(s),
      action: parseRecordedAction(s),
      expected: i < this.steps.length - 1
        ? { app: this.steps[i + 1].context.app, window: this.steps[i + 1].context.window }
        : undefined,
      min_confidence: s.targetElement
        ? Math.max(0.5, s.targetElement.confidence - 0.1)
        : undefined,
    }));

    const contextMap: Record<string, unknown> = {};
    for (const s of this.steps) {
      if (s.targetElement) {
        contextMap[s.targetElement.id] = {
          label: s.targetElement.label,
          type: s.targetElement.element_type,
          bounds: s.targetElement.bounds,
        };
      }
    }

    return {
      name,
      description,
      app: this.steps[0]?.context.app ?? "unknown",
      version: "1.0.0",
      steps,
      context_map: Object.keys(contextMap).length > 0 ? contextMap : undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /** Whether currently recording. */
  get isRecording(): boolean {
    return this.recording;
  }

  /** Get the current step count. */
  get stepCount(): number {
    return this.steps.length;
  }
}

/** Try to identify the target element from an action string and context. */
function identifyTarget(context: ScreenContext, action: string): ContextElement | undefined {
  // Action format: "click:element-id" or "type:element-id:text"
  const parts = action.split(":");
  if (parts.length < 2) return undefined;

  const targetId = parts[1];
  return context.elements.find(
    (el) => el.id === targetId || el.label === targetId,
  );
}

/** Create a human-readable description for a recorded step. */
function describeStep(step: RecordedStep): string {
  const parts = step.action.split(":");
  const actionType = parts[0];
  const target = step.targetElement?.label ?? parts[1] ?? "unknown";

  switch (actionType) {
    case "click":
      return `Click "${target}"`;
    case "type":
      return `Type "${parts.slice(2).join(":")}" into "${target}"`;
    case "key":
      return `Press ${parts[1]}`;
    case "key_combo":
      return `Press ${parts.slice(1).join("+")}`;
    case "scroll":
      return `Scroll ${parts[1] ?? ""}`;
    default:
      return step.action;
  }
}

/** Parse a recorded action string into a WorkflowAction. */
function parseRecordedAction(step: RecordedStep): WorkflowAction {
  const parts = step.action.split(":");
  const actionType = parts[0];

  switch (actionType) {
    case "click":
      return { type: "click", target: parts[1] ?? "" };
    case "type":
      return { type: "type", target: parts[1] ?? "", text: parts.slice(2).join(":") };
    case "key":
      return { type: "key", key: parts[1] ?? "" };
    case "key_combo":
      return { type: "key_combo", keys: parts.slice(1) };
    case "scroll": {
      const [, dx, dy] = parts;
      return { type: "scroll", dx: parseInt(dx ?? "0", 10), dy: parseInt(dy ?? "0", 10) };
    }
    case "wait": {
      const ms = parseInt(parts[1] ?? "1000", 10);
      return { type: "wait", ms };
    }
    default:
      return { type: "custom", adapter: "", action: step.action, params: {} };
  }
}
