import type { ReactNode } from "react";

/**
 * The top of every page: its title, one line saying what is on it, and on the right the page's
 * controls followed by its one primary action. Wraps under the title on a narrow screen.
 */
export default function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
