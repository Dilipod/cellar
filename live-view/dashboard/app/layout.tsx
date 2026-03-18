import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CEL Dashboard",
  description: "Context Execution Layer — Pipeline Dashboard",
};

const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/extractions", label: "Extractions" },
  { href: "/executions", label: "Executions" },
  { href: "/store", label: "Store" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <nav className="flex items-center gap-6 px-6 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold">CEL</span>
            <span className="text-xs text-[var(--dim)]">Pipeline Dashboard</span>
          </div>
          <div className="flex gap-1 ml-6">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="px-3 py-1.5 rounded-md text-sm text-[var(--dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
              >
                {item.label}
              </a>
            ))}
          </div>
          <div className="ml-auto">
            <span className="badge badge-live">Connected</span>
          </div>
        </nav>
        <main className="p-6">{children}</main>
      </body>
    </html>
  );
}
