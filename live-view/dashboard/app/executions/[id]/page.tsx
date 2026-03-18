"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface StepResult {
  step_index: number;
  step_id: string;
  action: string;
  success: boolean;
  confidence: number;
  context_snapshot: string | null;
  error: string | null;
  executed_at: string;
}

interface RunDetail {
  id: number;
  workflow_name: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  steps_completed: number;
  steps_total: number;
  interventions: number;
  steps?: StepResult[];
}

export default function ExecutionDetailPage() {
  const params = useParams();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [steps, setSteps] = useState<StepResult[]>([]);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/runs/${params.id}`).then((r) => r.json()),
      fetch(`/api/runs/${params.id}/steps`).then((r) => r.json()),
    ]).then(([runData, stepsData]) => {
      setRun(runData.error ? null : runData);
      setSteps(Array.isArray(stepsData) ? stepsData : []);
    }).catch(() => {});
  }, [params.id]);

  if (!run) {
    return (
      <div className="glass-dark p-8 text-center text-[var(--dim)]">
        <p>Execution #{params.id} not found.</p>
        <p className="mt-2 text-xs">
          In production, execution data comes from the SQLite <code className="text-[var(--cyan)]">run_history</code> table.
          Run a workflow or use <code className="text-[var(--cyan)]">runGoal()</code> to generate execution data.
        </p>
      </div>
    );
  }

  const statusColor =
    run.status === "completed" ? "var(--green)" :
    run.status === "failed" ? "var(--red)" :
    run.status === "running" ? "var(--cyan)" : "var(--dim)";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{run.workflow_name}</h1>
          <p className="text-sm text-[var(--dim)] mt-1">
            Run #{run.id} &middot; {run.steps_completed}/{run.steps_total} steps
            {run.interventions > 0 && ` · ${run.interventions} interventions`}
          </p>
        </div>
        <span style={{ color: statusColor }} className="text-lg font-semibold">
          {run.status}
        </span>
      </div>

      {/* Step Timeline */}
      <div className="glass-dark p-4">
        <h3 className="text-sm font-semibold mb-4">Step Timeline</h3>

        {steps.length === 0 ? (
          <div className="text-sm text-[var(--dim)]">No steps recorded for this run.</div>
        ) : (
          <div className="space-y-0">
            {steps.map((step, i) => {
              const isExpanded = expandedStep === i;
              let actionParsed: Record<string, unknown> = {};
              try { actionParsed = JSON.parse(step.action); } catch {}

              return (
                <div key={i}>
                  {/* Timeline row */}
                  <div
                    className={`flex items-start gap-3 py-3 px-2 cursor-pointer transition-colors rounded ${
                      isExpanded ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]"
                    }`}
                    onClick={() => setExpandedStep(isExpanded ? null : i)}
                  >
                    {/* Timeline dot + line */}
                    <div className="flex flex-col items-center pt-1">
                      <div
                        className={`w-3 h-3 rounded-full ${
                          step.success ? "bg-[var(--green)]" : "bg-[var(--red)]"
                        }`}
                      />
                      {i < steps.length - 1 && (
                        <div className="w-0.5 h-8 bg-[var(--border)] mt-1" />
                      )}
                    </div>

                    {/* Step info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          Step {step.step_index + 1}
                        </span>
                        <span className="text-xs text-[var(--dim)]">{step.step_id}</span>
                        <span className="ml-auto text-xs text-[var(--dim)]">
                          conf: {step.confidence.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--dim)] mt-0.5 font-mono truncate">
                        {actionParsed.type
                          ? `${actionParsed.type}(${actionParsed.target || actionParsed.target_id || actionParsed.key || ""})`
                          : step.action.slice(0, 80)
                        }
                      </div>
                      {step.error && (
                        <div className="text-xs text-[var(--red)] mt-0.5">{step.error}</div>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="ml-6 mb-3 p-3 bg-[var(--black)] border border-[var(--border)] rounded text-xs">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-[var(--dim)] mb-1">Action</div>
                          <pre className="font-mono text-[var(--text)] whitespace-pre-wrap">
                            {JSON.stringify(actionParsed, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <div className="text-[var(--dim)] mb-1">Result</div>
                          <div>Success: <span style={{ color: step.success ? "var(--green)" : "var(--red)" }}>{step.success ? "Yes" : "No"}</span></div>
                          <div>Confidence: {step.confidence.toFixed(3)}</div>
                          <div>Time: {new Date(step.executed_at).toLocaleTimeString()}</div>
                          {step.error && <div className="text-[var(--red)] mt-1">Error: {step.error}</div>}
                        </div>
                      </div>
                      {step.context_snapshot && (
                        <details className="mt-3">
                          <summary className="text-[var(--dim)] cursor-pointer hover:text-[var(--text)]">
                            Context Snapshot ({step.context_snapshot.length} chars)
                          </summary>
                          <pre className="mt-2 max-h-48 overflow-y-auto text-[var(--dim)] whitespace-pre-wrap">
                            {step.context_snapshot}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
