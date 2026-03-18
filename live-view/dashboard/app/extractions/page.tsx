"use client";

import { useEffect, useState } from "react";

interface ExtractionSummary {
  index: number;
  url: string;
  timestamp: number;
  totalElements: number;
  extractionMs: number;
  sources: { dom: number; a11y: number; vision: number; network: number };
}

export default function ExtractionsPage() {
  const [extractions, setExtractions] = useState<ExtractionSummary[]>([]);

  useEffect(() => {
    fetch("/api/extractions")
      .then((r) => r.json())
      .then(setExtractions)
      .catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Extractions</h1>

      {extractions.length === 0 ? (
        <div className="glass-dark p-8 text-center text-[var(--dim)]">
          No extractions yet. Go to Overview and extract a URL to see results here.
        </div>
      ) : (
        <div className="glass-dark overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--dim)] text-xs border-b border-[var(--border)]">
                <th className="text-left py-3 px-4">#</th>
                <th className="text-left py-3 px-4">URL</th>
                <th className="text-left py-3 px-4">Elements</th>
                <th className="text-left py-3 px-4">Time</th>
                <th className="text-left py-3 px-4">DOM</th>
                <th className="text-left py-3 px-4">A11y</th>
                <th className="text-left py-3 px-4">Vision</th>
                <th className="text-left py-3 px-4">Network</th>
                <th className="text-left py-3 px-4">When</th>
              </tr>
            </thead>
            <tbody>
              {extractions.map((ext) => (
                <tr
                  key={ext.index}
                  className="border-b border-[var(--border)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors"
                  onClick={() => window.location.href = `/extractions/${ext.index}`}
                >
                  <td className="py-2.5 px-4 text-[var(--dim)]">{ext.index}</td>
                  <td className="py-2.5 px-4 font-mono text-xs">{ext.url}</td>
                  <td className="py-2.5 px-4 font-bold">{ext.totalElements}</td>
                  <td className="py-2.5 px-4">
                    <span className="text-[var(--green)]">{ext.extractionMs}ms</span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full dot-dom" />
                      {ext.sources.dom}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full dot-a11y" />
                      {ext.sources.a11y}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full dot-vision" />
                      {ext.sources.vision}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full dot-network" />
                      {ext.sources.network}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-[var(--dim)] text-xs">
                    {new Date(ext.timestamp).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
