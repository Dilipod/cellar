"use client";

interface MetricCardProps {
  label: string;
  value: string | number;
  color?: string;
  subtitle?: string;
}

export function MetricCard({ label, value, color, subtitle }: MetricCardProps) {
  return (
    <div className="text-center py-3">
      <div
        className="text-2xl font-bold"
        style={{ color: color || "var(--text)" }}
      >
        {value}
      </div>
      <div className="text-xs text-[var(--dim)] mt-1">{label}</div>
      {subtitle && (
        <div className="text-xs text-[var(--dim)] mt-0.5">{subtitle}</div>
      )}
    </div>
  );
}
