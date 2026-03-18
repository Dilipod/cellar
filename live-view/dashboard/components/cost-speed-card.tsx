"use client";

interface CostSpeedProps {
  celCost: number;
  visionCost: number;
  savingsPct: number;
  celExtractMs: number;
  buExtractMs: number;
  speedMultiplier: number;
  celStepTime: number;
  buStepTime: number;
  promptTokens: number;
  structuredPct: number;
  visionFallback: number;
}

export function CostSpeedCard(props: CostSpeedProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {/* LLM Usage */}
      <div className="glass-dark p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">LLM Usage</h3>
          <span className="badge badge-live">Cost Savings</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center">
            <div className="text-2xl font-bold text-[var(--green)]">
              {props.structuredPct.toFixed(0)}%
            </div>
            <div className="text-xs text-[var(--dim)]">LLM-Free Context</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{props.visionFallback}</div>
            <div className="text-xs text-[var(--dim)]">Vision Fallback</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">
              {props.promptTokens.toLocaleString()}
            </div>
            <div className="text-xs text-[var(--dim)]">Prompt Tokens</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-[var(--green)]">
              {props.savingsPct.toFixed(0)}%
            </div>
            <div className="text-xs text-[var(--dim)]">
              Savings vs Vision-Only
            </div>
          </div>
        </div>
      </div>

      {/* Cost per Step */}
      <div className="glass-dark p-4">
        <h3 className="text-sm font-semibold mb-4">Cost per Step</h3>
        <div className="space-y-3">
          <Row
            dotColor="var(--green)"
            label="CEL (structured + planner)"
            value={`$${props.celCost.toFixed(5)}`}
            meta="per step"
          />
          <Row
            dotColor="var(--red)"
            label="Vision-only (screenshot)"
            value={`$${props.visionCost.toFixed(5)}`}
            meta="per step"
          />
          <div className="border-t border-[var(--border)] pt-3 flex justify-between items-center">
            <span className="text-sm font-semibold">10-step workflow</span>
            <span className="text-sm">
              <span className="text-[var(--green)]">
                ${(props.celCost * 10).toFixed(4)}
              </span>{" "}
              vs{" "}
              <span className="text-[var(--red)]">
                ${(props.visionCost * 10).toFixed(4)}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Speed per Step */}
      <div className="glass-dark p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Speed per Step</h3>
          <span className="badge badge-cyan">Extraction</span>
        </div>
        <div className="space-y-3">
          <Row
            dotColor="var(--green)"
            label="CEL extraction"
            value={`${props.celExtractMs}`}
            meta="ms"
          />
          <Row
            dotColor="var(--red)"
            label="browser-use extraction"
            value={props.buExtractMs.toLocaleString()}
            meta="ms (typical)"
          />
          <div className="border-t border-[var(--border)] pt-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold">Speedup</span>
              <span className="text-xl font-bold text-[var(--green)]">
                {props.speedMultiplier.toFixed(0)}x
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold">Total step time</span>
              <span className="text-sm">
                <span className="text-[var(--green)]">
                  {(props.celStepTime / 1000).toFixed(1)}s
                </span>{" "}
                vs{" "}
                <span className="text-[var(--red)]">
                  {(props.buStepTime / 1000).toFixed(1)}s
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  dotColor,
  label,
  value,
  meta,
}: {
  dotColor: string;
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span style={{ color: dotColor }}>&#9679;</span>
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-right">
        <div className="text-lg font-bold">{value}</div>
        <div className="text-xs text-[var(--dim)]">{meta}</div>
      </div>
    </div>
  );
}
