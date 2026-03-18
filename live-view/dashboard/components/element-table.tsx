"use client";

interface Element {
  id: string;
  type: string;
  label: string;
  confidence: number;
  actions: string[];
}

interface ElementTableProps {
  elements: Element[];
  maxRows?: number;
}

export function ElementTable({ elements, maxRows = 15 }: ElementTableProps) {
  const displayed = elements.slice(0, maxRows);

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[var(--dim)] text-xs border-b border-[var(--border)]">
            <th className="text-left py-2 px-2">Conf</th>
            <th className="text-left py-2 px-2">Type</th>
            <th className="text-left py-2 px-2">Label</th>
            <th className="text-left py-2 px-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {displayed.map((el, i) => {
            const confClass =
              el.confidence >= 0.9
                ? "conf-high"
                : el.confidence >= 0.7
                  ? "conf-med"
                  : "conf-low";
            const barWidth = Math.round(el.confidence * 60);

            return (
              <tr
                key={`${el.id}-${i}`}
                className="border-b border-[var(--border)] last:border-b-0"
              >
                <td className="py-1.5 px-2">
                  {el.confidence.toFixed(2)}{" "}
                  <span
                    className={`conf-bar ${confClass}`}
                    style={{ width: `${barWidth}px` }}
                  />
                </td>
                <td className="py-1.5 px-2">{el.type}</td>
                <td className="py-1.5 px-2">{el.label.slice(0, 25)}</td>
                <td className="py-1.5 px-2 text-[var(--dim)]">
                  {el.actions.join(", ") || "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {elements.length > maxRows && (
        <div className="text-xs text-[var(--dim)] mt-2 px-2">
          +{elements.length - maxRows} more elements
        </div>
      )}
    </div>
  );
}
