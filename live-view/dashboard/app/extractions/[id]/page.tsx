"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ElementTable } from "@/components/element-table";
import { CostSpeedCard } from "@/components/cost-speed-card";
import type { PipelineSnapshot } from "@/lib/api";

type DrillLevel = "merged" | "sources" | "raw";

export default function ExtractionDetailPage() {
  const params = useParams();
  const [extraction, setExtraction] = useState<PipelineSnapshot | null>(null);
  const [level, setLevel] = useState<DrillLevel>("merged");
  const [selectedSource, setSelectedSource] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/extractions/${params.id}`)
      .then((r) => r.json())
      .then(setExtraction)
      .catch(() => {});
  }, [params.id]);

  if (!extraction) {
    return (
      <div className="glass-dark p-8 text-center text-[var(--dim)]">
        Loading extraction {params.id}...
      </div>
    );
  }

  const e = extraction;
  const mergedElements = (e.planner?.topElements || []).map((el) => ({
    ...el,
    actions: el.actions || [],
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Extraction #{params.id}</h1>
          <p className="text-sm text-[var(--dim)] mt-1 font-mono">{e.url}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--dim)]">
            {e.stats?.totalElements} elements in {e.stats?.extractionMs}ms
          </span>
        </div>
      </div>

      {/* Drill-down tabs */}
      <div className="flex gap-1 border-b border-[var(--border)] pb-0">
        {(["merged", "sources", "raw"] as DrillLevel[]).map((l) => (
          <button
            key={l}
            onClick={() => { setLevel(l); setSelectedSource(null); }}
            className={`px-4 py-2 text-sm rounded-t-md transition-colors ${
              level === l
                ? "bg-[var(--surface-2)] text-[var(--cyan)] border-b-2 border-[var(--cyan)]"
                : "text-[var(--dim)] hover:text-[var(--text)]"
            }`}
          >
            {l === "merged" ? "Merged Context" : l === "sources" ? "Per-Source" : "Raw Stream Data"}
          </button>
        ))}
      </div>

      {/* Level 1: Merged Context */}
      {level === "merged" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="glass-dark p-4">
            <h3 className="text-sm font-semibold mb-3">All Elements (by confidence)</h3>
            <ElementTable elements={mergedElements} maxRows={30} />
          </div>
          <div className="glass-dark p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Planner Prompt</h3>
              <span className="badge badge-cyan">LLM Input</span>
            </div>
            <pre className="bg-[var(--black)] border border-[var(--border)] rounded p-3 text-xs text-[var(--dim)] font-mono whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed">
              {e.planner?.prompt || "No prompt generated"}
            </pre>
          </div>
        </div>
      )}

      {/* Level 2: Per-Source Breakdown */}
      {level === "sources" && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[
              { key: "dom", label: "DOM (CDP)", dotClass: "dot-dom", data: e.sources?.dom, status: "LIVE" },
              { key: "a11y", label: "Accessibility", dotClass: "dot-a11y", data: e.sources?.accessibility, status: "SIMULATED" },
              { key: "vision", label: "Vision", dotClass: "dot-vision", data: e.sources?.vision, status: "SIMULATED" },
              { key: "network", label: "Network", dotClass: "dot-network", data: e.sources?.network, status: "LIVE" },
            ].map((source) => {
              const count = source.key === "network"
                ? ((source.data as Record<string, unknown>)?.events as unknown[])?.length ?? 0
                : ((source.data as Record<string, unknown>)?.elements as unknown[])?.length ?? 0;
              const isSelected = selectedSource === source.key;
              return (
                <div
                  key={source.key}
                  onClick={() => setSelectedSource(isSelected ? null : source.key)}
                  className={`glass-dark p-4 cursor-pointer transition-all ${
                    isSelected ? "ring-1 ring-[var(--cyan)]" : "hover:ring-1 hover:ring-[var(--border)]"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${source.dotClass}`} />
                    <span className="text-sm font-medium">{source.label}</span>
                  </div>
                  <div className="text-3xl font-bold">{count}</div>
                  <div className="text-xs text-[var(--dim)] mt-1">
                    <span className={`badge ${source.status === "LIVE" ? "badge-live" : "badge-simulated"}`}>
                      {source.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected source detail */}
          {selectedSource && selectedSource !== "network" && (
            <div className="glass-dark p-4">
              <h3 className="text-sm font-semibold mb-3">
                {selectedSource === "dom" ? "DOM" : selectedSource === "a11y" ? "Accessibility" : "Vision"} Elements
              </h3>
              <SourceElementsTable
                elements={
                  ((e.sources as Record<string, Record<string, unknown>>)?.[
                    selectedSource === "a11y" ? "accessibility" : selectedSource
                  ]?.elements as Array<Record<string, unknown>>) || []
                }
              />
            </div>
          )}

          {selectedSource === "network" && (
            <div className="glass-dark p-4">
              <h3 className="text-sm font-semibold mb-3">Network Events</h3>
              <div className="space-y-1">
                {((e.sources?.network as Record<string, unknown>)?.events as Array<Record<string, unknown>> || []).map((ev, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs font-mono py-1 border-b border-[var(--border)] last:border-b-0">
                    <span className={`font-bold ${(ev.status as number) >= 400 ? "text-[var(--red)]" : "text-[var(--green)]"}`}>
                      {String(ev.status || "?")}
                    </span>
                    <span className="text-[var(--dim)]">{String(ev.method || "?")}</span>
                    <span className="truncate">{String(ev.url || "")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Level 3: Raw Stream Data */}
      {level === "raw" && (
        <div className="glass-dark p-4">
          <h3 className="text-sm font-semibold mb-3">Raw Extraction Data</h3>
          <pre className="bg-[var(--black)] border border-[var(--border)] rounded p-3 text-xs text-[var(--dim)] font-mono whitespace-pre-wrap max-h-[600px] overflow-y-auto leading-relaxed">
            {JSON.stringify(extraction, null, 2)}
          </pre>
        </div>
      )}

      {/* LLM Economics */}
      {e.llmEconomics && (
        <CostSpeedCard
          celCost={e.llmEconomics.estimatedCostPerStep}
          visionCost={e.llmEconomics.visionOnlyCostPerStep}
          savingsPct={e.llmEconomics.savingsVsVisionOnly}
          celExtractMs={e.llmEconomics.celExtractionMs}
          buExtractMs={e.llmEconomics.browserUseExtractionMs}
          speedMultiplier={e.llmEconomics.speedMultiplier}
          celStepTime={e.llmEconomics.celStepTimeMs}
          buStepTime={e.llmEconomics.browserUseStepTimeMs}
          promptTokens={e.llmEconomics.plannerPromptTokens}
          structuredPct={e.llmEconomics.structuredPct}
          visionFallback={e.llmEconomics.visionFallbackElements}
        />
      )}
    </div>
  );
}

function SourceElementsTable({ elements }: { elements: Array<Record<string, unknown>> }) {
  if (elements.length === 0) {
    return <div className="text-sm text-[var(--dim)]">No elements from this source</div>;
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[var(--dim)] border-b border-[var(--border)]">
          <th className="text-left py-2 px-2">ID</th>
          <th className="text-left py-2 px-2">Type</th>
          <th className="text-left py-2 px-2">Label</th>
          <th className="text-left py-2 px-2">Confidence</th>
          <th className="text-left py-2 px-2">Visible</th>
          <th className="text-left py-2 px-2">Enabled</th>
        </tr>
      </thead>
      <tbody>
        {elements.slice(0, 50).map((el, i) => (
          <tr key={i} className="border-b border-[var(--border)] last:border-b-0">
            <td className="py-1.5 px-2 font-mono">{String(el.id || "-")}</td>
            <td className="py-1.5 px-2">{String(el.element_type || "-")}</td>
            <td className="py-1.5 px-2">{String(el.label || "-").slice(0, 30)}</td>
            <td className="py-1.5 px-2">{typeof el.confidence === "number" ? el.confidence.toFixed(2) : "-"}</td>
            <td className="py-1.5 px-2">{(el.state as Record<string, unknown>)?.visible ? "Y" : "N"}</td>
            <td className="py-1.5 px-2">{(el.state as Record<string, unknown>)?.enabled ? "Y" : "N"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
