/** Bounds in screen coordinates. */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A single UI element from the unified context API. */
export interface ContextElement {
  id: string;
  label?: string;
  element_type: string;
  value?: string;
  bounds?: Bounds;
  confidence: number;
  source: "accessibility_tree" | "native_api" | "vision" | "merged";
}

/** The unified screen context returned by CEL. */
export interface ScreenContext {
  app: string;
  window: string;
  elements: ContextElement[];
  timestamp_ms: number;
}

/** A single step in a workflow. */
export interface WorkflowStep {
  id: string;
  description: string;
  action: WorkflowAction;
  /** Expected context after this step completes. */
  expected?: Partial<ScreenContext>;
  /** Minimum confidence required to proceed. */
  min_confidence?: number;
}

/** An action the agent can take. */
export type WorkflowAction =
  | { type: "click"; target: string; button?: "left" | "right" }
  | { type: "type"; target: string; text: string }
  | { type: "key"; key: string }
  | { type: "key_combo"; keys: string[] }
  | { type: "wait"; ms: number }
  | { type: "scroll"; dx: number; dy: number }
  | { type: "custom"; adapter: string; action: string; params: Record<string, unknown> };

/** A complete workflow definition. */
export interface Workflow {
  name: string;
  description: string;
  app: string;
  version: string;
  steps: WorkflowStep[];
  /** Context map from training phase. */
  context_map?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Workflow execution status. */
export type WorkflowStatus = "idle" | "running" | "paused" | "completed" | "failed" | "queued";

/** Priority levels for the workflow queue. */
export type Priority = "low" | "normal" | "high" | "critical";
