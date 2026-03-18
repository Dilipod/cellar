"use client";

import { useEffect, useState } from "react";

interface RunSummary {
  id: number;
  workflow_name: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  steps_completed: number;
  steps_total: number;
  interventions: number;
}

export default function ExecutionsPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);

  useEffect(() => {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((data) => setRuns(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Executions</h1>

      {runs.length === 0 ? (
        <div className="glass-dark p-8 text-center text-[var(--dim)]">
          <p>No workflow executions recorded yet.</p>
          <p className="mt-2 text-xs">
            Executions appear here when workflows are run through the CEL engine
            or when the planner executes goals via <code className="text-[var(--cyan)]">runGoal()</code>.
          </p>
          <p className="mt-4 text-xs">
            In production, this data comes from the SQLite <code className="text-[var(--cyan)]">run_history</code> and{" "}
            <code className="text-[var(--cyan)]">step_results</code> tables via cel-store.
          </p>
        </div>
      ) : (
        <div className="glass-dark overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--dim)] text-xs border-b border-[var(--border)]">
                <th className="text-left py-3 px-4">ID</th>
                <th className="text-left py-3 px-4">Workflow</th>
                <th className="text-left py-3 px-4">Status</th>
                <th className="text-left py-3 px-4">Steps</th>
                <th className="text-left py-3 px-4">Interventions</th>
                <th className="text-left py-3 px-4">Started</th>
                <th className="text-left py-3 px-4">Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const statusColor =
                  run.status === "completed" ? "var(--green)" :
                  run.status === "failed" ? "var(--red)" :
                  run.status === "running" ? "var(--cyan)" : "var(--dim)";
                const duration = run.finished_at && run.started_at
                  ? `${((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000).toFixed(1)}s`
                  : "-";
                return (
                  <tr
                    key={run.id}
                    className="border-b border-[var(--border)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors"
                    onClick={() => window.location.href = `/executions/${run.id}`}
                  >
                    <td className="py-2.5 px-4 text-[var(--dim)]">{run.id}</td>
                    <td className="py-2.5 px-4 font-medium">{run.workflow_name}</td>
                    <td className="py-2.5 px-4">
                      <span style={{ color: statusColor }} className="font-medium">
                        {run.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      {run.steps_completed}/{run.steps_total}
                    </td>
                    <td className="py-2.5 px-4">
                      {run.interventions > 0 ? (
                        <span className="text-[var(--yellow)]">{run.interventions}</span>
                      ) : (
                        <span className="text-[var(--dim)]">0</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-[var(--dim)]">
                      {new Date(run.started_at).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-xs">{duration}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
