"use client";

interface Source {
  name: string;
  count: number;
  dotClass: string;
  status: "live" | "simulated" | "unavailable";
  meta?: string;
}

interface SourceBreakdownProps {
  sources: Source[];
}

export function SourceBreakdown({ sources }: SourceBreakdownProps) {
  return (
    <div className="space-y-3">
      {sources.map((source) => (
        <div
          key={source.name}
          className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-b-0"
        >
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${source.dotClass}`} />
            <span className="text-sm">{source.name}</span>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold">{source.count}</div>
            <div className="flex items-center gap-1.5">
              <span
                className={`badge ${
                  source.status === "live"
                    ? "badge-live"
                    : source.status === "simulated"
                      ? "badge-simulated"
                      : ""
                }`}
              >
                {source.status.toUpperCase()}
              </span>
              {source.meta && (
                <span className="text-xs text-[var(--dim)]">{source.meta}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
