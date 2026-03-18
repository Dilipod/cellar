"use client";

import { useEffect, useState, useCallback } from "react";
import { MetricCard } from "@/components/metric-card";
import { SourceBreakdown } from "@/components/source-breakdown";
import { ElementTable } from "@/components/element-table";
import { CostSpeedCard } from "@/components/cost-speed-card";
import type { PipelineSnapshot } from "@/lib/api";

export default function OverviewPage() {
  const [snapshot, setSnapshot] = useState<PipelineSnapshot | null>(null);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [accuracy, setAccuracy] = useState<{
    value: number;
    matched: number;
    total: number;
  } | null>(null);

  // SSE connection for live updates
  useEffect(() => {
    const evtSource = new EventSource("/api/events");
    evtSource.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "snapshot") {
          setSnapshot(msg.data);
          setUrl(msg.data.url || "");
        }
        if (msg.type === "re-execution") {
          setAccuracy({
            value: msg.data.accuracy,
            matched: msg.data.matched,
            total: msg.data.total,
          });
        }
      } catch {}
    };
    return () => evtSource.close();
  }, []);

  const extract = useCallback(async () => {
    if (!url.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data);
      }
    } finally {
      setLoading(false);
    }
  }, [url]);

  const reExecute = useCallback(async () => {
    const res = await fetch("/api/re-execute", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setAccuracy({
        value: data.accuracy,
        matched: data.matched,
        total: data.total,
      });
    }
  }, []);

  const s = snapshot;

  return (
    <div className="space-y-6">
      {/* URL Bar + Actions */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && extract()}
          placeholder="Enter URL to analyze..."
          className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm text-[var(--text)] placeholder:text-[var(--dim)] focus:outline-none focus:border-[var(--cyan)]"
        />
        <button
          onClick={extract}
          disabled={loading}
          className="px-5 py-2 bg-[var(--cyan)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Extracting..." : "Extract"}
        </button>
        <button
          onClick={reExecute}
          className="px-5 py-2 bg-[var(--green)] text-white rounded-lg text-sm font-medium hover:opacity-90"
        >
          Re-execute
        </button>
        {s && (
          <span className="text-xs text-[var(--dim)]">
            Extracted in {s.stats.extractionMs}ms
          </span>
        )}
      </div>

      {!s ? (
        <div className="text-center py-20 text-[var(--dim)]">
          Enter a URL and click Extract to begin, or connect to a running CEL
          session.
        </div>
      ) : (
        <>
          {/* Row 1: Sources + Merged Stats + Element Types */}
          <div className="grid grid-cols-3 gap-4">
            <div className="glass-dark p-4">
              <h3 className="text-sm font-semibold mb-3">Context Sources</h3>
              <SourceBreakdown
                sources={[
                  {
                    name: "DOM (CDP)",
                    count: s.sources.dom.elements.length,
                    dotClass: "dot-dom",
                    status: "live",
                    meta: `${s.sources.dom.extractionMs}ms`,
                  },
                  {
                    name: "Accessibility",
                    count: s.sources.accessibility.elements.length,
                    dotClass: "dot-a11y",
                    status: s.sources.accessibility.available
                      ? "live"
                      : "simulated",
                  },
                  {
                    name: "Vision",
                    count: s.sources.vision.elements.length,
                    dotClass: "dot-vision",
                    status: s.sources.vision.available
                      ? "live"
                      : "simulated",
                  },
                  {
                    name: "Network",
                    count: s.sources.network.events.length,
                    dotClass: "dot-network",
                    status: "live",
                  },
                ]}
              />
            </div>

            <div className="glass-dark p-4">
              <h3 className="text-sm font-semibold mb-3">Merged Context</h3>
              <div className="grid grid-cols-2">
                <MetricCard
                  label="Total Elements"
                  value={s.stats.totalElements}
                />
                <MetricCard
                  label="Actionable"
                  value={s.planner.actionableCount}
                />
                <MetricCard
                  label="Avg Confidence"
                  value={s.planner.avgConfidence.toFixed(2)}
                />
                <MetricCard
                  label="Extraction (ms)"
                  value={s.stats.extractionMs}
                />
              </div>
            </div>

            <div className="glass-dark p-4">
              <h3 className="text-sm font-semibold mb-3">Element Types</h3>
              <div className="space-y-1">
                {Object.entries(s.stats.byType)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 8)
                  .map(([type, count]) => {
                    const maxCount = Math.max(
                      ...Object.values(s.stats.byType)
                    );
                    const pct = (count / maxCount) * 100;
                    return (
                      <div
                        key={type}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="w-20 text-right text-[var(--dim)]">
                          {type}
                        </span>
                        <div
                          className="h-4 rounded bg-[var(--cyan)] min-w-1"
                          style={{ width: `${pct}%` }}
                        />
                        <span className="text-xs text-[var(--dim)]">
                          {count}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Row 2: LLM Economics */}
          {s.llmEconomics && (
            <CostSpeedCard
              celCost={s.llmEconomics.estimatedCostPerStep}
              visionCost={s.llmEconomics.visionOnlyCostPerStep}
              savingsPct={s.llmEconomics.savingsVsVisionOnly}
              celExtractMs={s.llmEconomics.celExtractionMs}
              buExtractMs={s.llmEconomics.browserUseExtractionMs}
              speedMultiplier={s.llmEconomics.speedMultiplier}
              celStepTime={s.llmEconomics.celStepTimeMs}
              buStepTime={s.llmEconomics.browserUseStepTimeMs}
              promptTokens={s.llmEconomics.plannerPromptTokens}
              structuredPct={s.llmEconomics.structuredPct}
              visionFallback={s.llmEconomics.visionFallbackElements}
            />
          )}

          {/* Row 3: Elements + Planner Prompt */}
          <div className="grid grid-cols-2 gap-4">
            <div className="glass-dark p-4">
              <h3 className="text-sm font-semibold mb-3">
                Top Elements (by confidence)
              </h3>
              <ElementTable elements={s.planner.topElements} />
            </div>

            <div className="glass-dark p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">
                  Planner Prompt Preview
                </h3>
                <span className="badge badge-cyan">LLM Input</span>
              </div>
              <pre className="bg-[var(--black)] border border-[var(--border)] rounded p-3 text-xs text-[var(--dim)] font-mono whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed">
                {s.planner.prompt}
              </pre>
            </div>
          </div>

          {/* Row 4: Accuracy + Context Breakdown */}
          <div className="grid grid-cols-2 gap-4">
            <div className="glass-dark p-4">
              <h3 className="text-sm font-semibold mb-3">
                Re-execution Accuracy
              </h3>
              <div className="text-center py-4">
                {accuracy ? (
                  <>
                    <div
                      className="text-5xl font-bold"
                      style={{
                        color:
                          accuracy.value >= 0.9
                            ? "var(--green)"
                            : accuracy.value >= 0.7
                              ? "var(--yellow)"
                              : "var(--red)",
                      }}
                    >
                      {(accuracy.value * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-[var(--dim)] mt-2">
                      {accuracy.matched}/{accuracy.total} elements matched
                    </div>
                  </>
                ) : (
                  <div className="text-[var(--dim)]">
                    Click &quot;Re-execute&quot; to measure extraction
                    consistency
                  </div>
                )}
              </div>
            </div>

            <div className="glass-dark p-4">
              <h3 className="text-sm font-semibold mb-3">
                Context Breakdown
              </h3>
              {s.llmEconomics && (
                <div>
                  <div className="flex h-6 rounded overflow-hidden gap-0.5 mt-6">
                    <div
                      className="bg-[var(--cyan)] rounded"
                      style={{
                        flex: s.sources.dom.elements.length,
                      }}
                      title={`DOM: ${s.sources.dom.elements.length}`}
                    />
                    <div
                      className="bg-[var(--green)] rounded"
                      style={{
                        flex: s.sources.accessibility.elements.length,
                      }}
                      title={`A11y: ${s.sources.accessibility.elements.length}`}
                    />
                    {s.llmEconomics.visionFallbackElements > 0 && (
                      <div
                        className="bg-[var(--purple)] rounded"
                        style={{
                          flex: s.llmEconomics.visionFallbackElements,
                        }}
                        title={`Vision: ${s.llmEconomics.visionFallbackElements}`}
                      />
                    )}
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-[var(--dim)]">
                    <span>
                      <span className="text-[var(--cyan)]">&#9632;</span> DOM
                    </span>
                    <span>
                      <span className="text-[var(--green)]">&#9632;</span>{" "}
                      A11y
                    </span>
                    <span>
                      <span className="text-[var(--purple)]">&#9632;</span>{" "}
                      Vision/LLM
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
