import type {
  Workflow,
  WorkflowStep,
  WorkflowStatus,
  ScreenContext,
} from "./types.js";
import { WorkflowQueue, type QueueEntry } from "./queue.js";

/** Confidence thresholds matching CEL's confidence-driven behavior. */
const CONFIDENCE_THRESHOLDS = {
  actImmediately: 0.9,
  actAndLog: 0.7,
  actCautiously: 0.5,
};

export interface EngineCallbacks {
  /** Called to get current screen context from CEL. */
  getContext: () => Promise<ScreenContext>;
  /** Called to execute an action via CEL input layer. */
  executeAction: (step: WorkflowStep) => Promise<boolean>;
  /** Called when confidence is too low — agent pauses for user. */
  onPause: (step: WorkflowStep, context: ScreenContext) => Promise<void>;
  /** Called on step completion. */
  onStepComplete: (step: WorkflowStep, stepIndex: number) => void;
  /** Called on workflow completion. */
  onComplete: (workflow: Workflow, status: WorkflowStatus) => void;
  /** Called for logging. */
  onLog: (level: "info" | "warn" | "error", message: string) => void;
}

/**
 * Workflow execution engine.
 * Runs workflows step-by-step, respecting confidence thresholds.
 */
export class WorkflowEngine {
  private queue = new WorkflowQueue();
  private running = false;

  constructor(private callbacks: EngineCallbacks) {}

  /** Submit a workflow for execution. */
  submit(workflow: Workflow, priority: "low" | "normal" | "high" | "critical" = "normal"): string {
    return this.queue.enqueue(workflow, priority);
  }

  /** Start processing the queue. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    while (this.running) {
      const entry = this.queue.dequeue();
      if (!entry) {
        // No work — wait briefly and check again
        await sleep(1000);
        continue;
      }

      await this.executeWorkflow(entry);
    }
  }

  /** Stop the engine after the current workflow completes. */
  stop(): void {
    this.running = false;
  }

  private async executeWorkflow(entry: QueueEntry): Promise<void> {
    const { workflow } = entry;
    this.callbacks.onLog("info", `Starting workflow: ${workflow.name}`);

    let status: WorkflowStatus = "completed";

    for (let i = 0; i < workflow.steps.length; i++) {
      if (!this.running) {
        status = "failed";
        break;
      }

      const step = workflow.steps[i];
      const context = await this.callbacks.getContext();

      // Check confidence of relevant elements
      const relevantElements = context.elements.filter(
        (el) => el.id === step.action.type || el.label === step.description
      );
      const maxConfidence = relevantElements.length > 0
        ? Math.max(...relevantElements.map((el) => el.confidence))
        : 0;

      const minRequired = step.min_confidence ?? CONFIDENCE_THRESHOLDS.actCautiously;

      if (maxConfidence < minRequired) {
        this.callbacks.onLog(
          "warn",
          `Low confidence (${maxConfidence}) at step ${i}: ${step.description}`
        );
        await this.callbacks.onPause(step, context);
      }

      try {
        const success = await this.callbacks.executeAction(step);
        if (!success) {
          this.callbacks.onLog("error", `Step ${i} failed: ${step.description}`);
          status = "failed";
          break;
        }
        this.callbacks.onStepComplete(step, i);
      } catch (err) {
        this.callbacks.onLog("error", `Step ${i} error: ${err}`);
        status = "failed";
        break;
      }
    }

    this.queue.complete(status as "completed" | "failed");
    this.callbacks.onComplete(workflow, status);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
