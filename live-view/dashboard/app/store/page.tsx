"use client";

import { useEffect, useState } from "react";

type Tab = "overview" | "runs" | "knowledge" | "observations";

interface StoreSummary {
  runs: number;
  extractions: number;
  knowledge: number;
  observations: number;
}

export default function StorePage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [summary, setSummary] = useState<StoreSummary | null>(null);
  const [runs, setRuns] = useState<Array<Record<string, unknown>>>([]);
  const [extractions, setExtractions] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    fetch("/api/store/summary").then((r) => r.json()).then(setSummary).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === "runs") {
      fetch("/api/runs").then((r) => r.json()).then((d) => setRuns(Array.isArray(d) ? d : [])).catch(() => {});
    }
  }, [tab]);

  useEffect(() => {
    if (tab === "overview") {
      fetch("/api/extractions").then((r) => r.json()).then((d) => setExtractions(Array.isArray(d) ? d : [])).catch(() => {});
    }
  }, [tab]);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Store Browser</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-[var(--border)] pb-0">
        {(["overview", "runs", "knowledge", "observations"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm rounded-t-md transition-colors capitalize ${
              tab === t
                ? "bg-[var(--surface-2)] text-[var(--cyan)] border-b-2 border-[var(--cyan)]"
                : "text-[var(--dim)] hover:text-[var(--text)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Extractions", value: summary?.extractions ?? 0, color: "var(--cyan)" },
              { label: "Runs", value: summary?.runs ?? 0, color: "var(--green)" },
              { label: "Knowledge Facts", value: summary?.knowledge ?? 0, color: "var(--purple)" },
              { label: "Observations", value: summary?.observations ?? 0, color: "var(--orange)" },
            ].map((stat) => (
              <div key={stat.label} className="glass-dark p-4 text-center">
                <div className="text-3xl font-bold" style={{ color: stat.color }}>
                  {stat.value}
                </div>
                <div className="text-xs text-[var(--dim)] mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="glass-dark p-4">
            <h3 className="text-sm font-semibold mb-3">Recent Extractions</h3>
            {extractions.length === 0 ? (
              <div className="text-sm text-[var(--dim)]">No extractions recorded.</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[var(--dim)] border-b border-[var(--border)]">
                    <th className="text-left py-2 px-2">#</th>
                    <th className="text-left py-2 px-2">URL</th>
                    <th className="text-left py-2 px-2">Elements</th>
                    <th className="text-left py-2 px-2">Time</th>
                    <th className="text-left py-2 px-2">When</th>
                  </tr>
                </thead>
                <tbody>
                  {extractions.slice(0, 20).map((ext, i) => (
                    <tr key={i} className="border-b border-[var(--border)] last:border-b-0">
                      <td className="py-1.5 px-2 text-[var(--dim)]">{ext.index as number}</td>
                      <td className="py-1.5 px-2 font-mono">{String(ext.url || "-")}</td>
                      <td className="py-1.5 px-2 font-bold">{ext.totalElements as number}</td>
                      <td className="py-1.5 px-2 text-[var(--green)]">{ext.extractionMs as number}ms</td>
                      <td className="py-1.5 px-2 text-[var(--dim)]">
                        {new Date(ext.timestamp as number).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="glass-dark p-4">
            <h3 className="text-sm font-semibold mb-3">Storage Info</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-[var(--dim)] text-xs mb-1">Database</div>
                <code className="text-xs text-[var(--cyan)]">~/.cellar/cel-store.db</code>
              </div>
              <div>
                <div className="text-[var(--dim)] text-xs mb-1">Tables</div>
                <div className="text-xs text-[var(--dim)]">
                  run_history, step_results, agent_knowledge, knowledge_scoped, knowledge_fts,
                  observations, working_memory, context_maps, confidence_history
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Runs */}
      {tab === "runs" && (
        <div className="glass-dark p-4">
          {runs.length === 0 ? (
            <div className="text-sm text-[var(--dim)]">No runs in store.</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--dim)] border-b border-[var(--border)]">
                  <th className="text-left py-2 px-2">ID</th>
                  <th className="text-left py-2 px-2">Workflow</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-left py-2 px-2">Steps</th>
                  <th className="text-left py-2 px-2">Started</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run, i) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="py-1.5 px-2">{String(run.id)}</td>
                    <td className="py-1.5 px-2">{String(run.workflow_name)}</td>
                    <td className="py-1.5 px-2">{String(run.status)}</td>
                    <td className="py-1.5 px-2">{String(run.steps_completed)}/{String(run.steps_total)}</td>
                    <td className="py-1.5 px-2 text-[var(--dim)]">{String(run.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Knowledge */}
      {tab === "knowledge" && (
        <div className="glass-dark p-4">
          <div className="flex items-center gap-3 mb-4">
            <input
              type="text"
              placeholder="Search knowledge (FTS5)..."
              className="flex-1 bg-[var(--black)] border border-[var(--border)] rounded px-3 py-1.5 text-sm text-[var(--text)] placeholder:text-[var(--dim)] focus:outline-none focus:border-[var(--cyan)]"
            />
            <button className="px-4 py-1.5 bg-[var(--cyan)] text-white rounded text-sm hover:opacity-90">
              Search
            </button>
          </div>
          <div className="text-sm text-[var(--dim)]">
            Knowledge search requires cel-store (SQLite) connection.
            In production, this queries the <code className="text-[var(--cyan)]">knowledge_fts</code> virtual table with BM25 ranking.
          </div>
        </div>
      )}

      {/* Observations */}
      {tab === "observations" && (
        <div className="glass-dark p-4">
          <div className="text-sm text-[var(--dim)]">
            Observations are compressed learnings from past workflow runs.
            In production, these are stored per-workflow in the <code className="text-[var(--cyan)]">observations</code> table,
            sorted by priority (high/medium/low) and creation date.
          </div>
        </div>
      )}
    </div>
  );
}
