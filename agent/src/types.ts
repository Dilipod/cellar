/** Bounds in screen coordinates. */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Element state flags from the accessibility tree. */
export interface ElementState {
  focused: boolean;
  enabled: boolean;
  visible: boolean;
  selected: boolean;
  /** For expandable elements (trees, accordions). null if not expandable. */
  expanded?: boolean | null;
  /** For checkable elements (checkboxes, radio buttons). null if not checkable. */
  checked?: boolean | null;
}

/** A single UI element from the unified context API. */
export interface ContextElement {
  id: string;
  label?: string;
  /** Accessibility description (tooltip / secondary label). */
  description?: string;
  element_type: string;
  value?: string;
  bounds?: Bounds;
  /** Element state flags (focused, enabled, visible, etc.). */
  state: ElementState;
  /** ID of the parent element, preserving tree hierarchy. */
  parent_id?: string | null;
  /** Available actions from AT-SPI2 Action interface: "click", "press", "activate", etc. */
  actions?: string[];
  confidence: number;
  source: "accessibility_tree" | "native_api" | "vision" | "merged";
}

/** The unified screen context returned by CEL. */
export interface ScreenContext {
  app: string;
  window: string;
  elements: ContextElement[];
  network_events?: NetworkEvent[];
  timestamp_ms: number;
}

/** A network event captured by the network monitor. */
export interface NetworkEvent {
  url: string;
  method?: string;
  status?: number;
  content_type?: string;
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
