/** API client for the live-view server. */

const API_BASE = "/api";

export interface PipelineSnapshot {
  timestamp: number;
  url: string;
  sources: {
    dom: { elements: unknown[]; extractionMs: number };
    accessibility: { elements: unknown[]; available: boolean };
    vision: { elements: unknown[]; available: boolean };
    network: { events: unknown[] };
  };
  merged: {
    app: string;
    window: string;
    elements: ContextElementDTO[];
    network_events?: unknown[];
    timestamp_ms: number;
  };
  planner: {
    prompt: string;
    elementCount: number;
    actionableCount: number;
    avgConfidence: number;
    topElements: Array<{
      id: string;
      type: string;
      label: string;
      confidence: number;
      actions: string[];
    }>;
  };
  stats: {
    totalElements: number;
    byType: Record<string, number>;
    bySource: Record<string, number>;
    extractionMs: number;
  };
  llmEconomics: {
    structuredElements: number;
    visionFallbackElements: number;
    structuredPct: number;
    plannerPromptTokens: number;
    estimatedCostPerStep: number;
    visionOnlyCostPerStep: number;
    savingsVsVisionOnly: number;
    celExtractionMs: number;
    browserUseExtractionMs: number;
    speedMultiplier: number;
    celStepTimeMs: number;
    browserUseStepTimeMs: number;
  };
}

export interface ContextElementDTO {
  id: string;
  label?: string;
  description?: string;
  element_type: string;
  value?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  state: { focused: boolean; enabled: boolean; visible: boolean; selected: boolean };
  actions?: string[];
  confidence: number;
  source: string;
}

export interface RunRecord {
  id: number;
  workflow_name: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  steps_completed: number;
  steps_total: number;
  interventions: number;
}

export interface StepRecord {
  id: number;
  run_id: number;
  step_index: number;
  step_id: string;
  action: string;
  success: boolean;
  confidence: number;
  context_snapshot: string | null;
  error: string | null;
  executed_at: string;
}

export async function fetchSnapshot(): Promise<PipelineSnapshot | null> {
  try {
    const res = await fetch(`${API_BASE}/stats`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function extractUrl(url: string): Promise<PipelineSnapshot | null> {
  try {
    const res = await fetch(`${API_BASE}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function reExecute(): Promise<{
  accuracy: number;
  matched: number;
  total: number;
  extractionMs: number;
} | null> {
  try {
    const res = await fetch(`${API_BASE}/re-execute`, { method: "POST" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchRuns(): Promise<RunRecord[]> {
  try {
    const res = await fetch(`${API_BASE}/runs`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchRunSteps(runId: number): Promise<StepRecord[]> {
  try {
    const res = await fetch(`${API_BASE}/runs/${runId}/steps`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}
