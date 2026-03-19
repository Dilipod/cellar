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

/** Coarse spatial region for resilient element targeting. */
export interface BoundsRegion {
  quadrant: string;
  relative_x: number;
  relative_y: number;
}

/** A resilient, multi-signal reference to a UI element.
 * Unlike element IDs (ephemeral per snapshot), references survive across
 * context snapshots by combining multiple identifying signals. */
export interface ContextReference {
  element_type: string;
  label?: string;
  ancestor_path?: string[];
  bounds_region?: BoundsRegion;
  value_pattern?: string;
}

/** High-fidelity context for a single element — the "zoom in" view. */
export interface FocusedContext {
  element: ContextElement;
  subtree: ContextElement[];
  ancestor_path: string[];
}

/** Events emitted by the ContextWatchdog when screen state changes. */
export type CelEvent =
  | { type: "TreeChanged"; added: string[]; removed: string[] }
  | { type: "NetworkIdle" }
  | { type: "FocusChanged"; old: string | null; new: string | null };

/** CDP page content extracted from Chromium-based apps. */
export interface PageContent {
  title: string;
  url: string;
  body_text: string;
  text_blocks: TextBlock[];
  interactive_elements: DomElement[];
}

export interface TextBlock {
  block_type: string;
  text: string;
  level?: number;
}

export interface DomElement {
  tag: string;
  element_type: string;
  text: string;
  href?: string;
  input_type?: string;
  value?: string;
  placeholder?: string;
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
  /** Runtime variables for {{placeholder}} substitution in type actions. */
  variables?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

/** Workflow execution status. */
export type WorkflowStatus = "idle" | "running" | "paused" | "completed" | "failed" | "queued";

/** Priority levels for the workflow queue. */
export type Priority = "low" | "normal" | "high" | "critical";

// --- Planner types (from cel-planner) ---

/** A single step planned by the LLM. */
export interface PlannedStep {
  reasoning: string;
  action: PlannedAction;
  expected_outcome: string;
  confidence: number;
}

/** An action the planner wants to execute. */
export type PlannedAction =
  | { type: "click"; target_id: string }
  | { type: "type"; target_id: string; text: string }
  | { type: "key"; key: string }
  | { type: "key_combo"; keys: string[] }
  | { type: "scroll"; dx: number; dy: number }
  | { type: "wait"; ms: number }
  | { type: "custom"; adapter: string; action: string; params: Record<string, unknown> }
  | { type: "done"; summary: string; evidence_ids?: string[] }
  | { type: "fail"; reason: string };

/** A recorded step from the planner's history. */
export interface PlannerStepRecord {
  step_index: number;
  action: PlannedAction;
  success: boolean;
  error?: string;
}

/** Aggregated metrics for an entire goal run. */
export interface GoalMetrics {
  /** Total wall-clock time in milliseconds. */
  totalMs: number;
  /** Time spent on context extraction (getContext calls). */
  contextExtractionMs: number;
  /** Total LLM planning calls (text + vision). */
  llmCalls: number;
  /** How many of those used vision (screenshot). */
  visionCalls: number;
  /** Total errors encountered. */
  errorCount: number;
  /** How many times state changed mid-step (triggered re-plan). */
  stateChanges: number;
  /** How many loop warnings were issued. */
  loopWarnings: number;
}
