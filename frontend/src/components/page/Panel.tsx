import type { ReactNode } from "react";

/** A card with the app's standard padding, a title row (title, note, one action) and its content. */
export default function Panel({
  title,
  note,
  action,
  children,
  className = "",
  tone,
  id,
}: {
  title: ReactNode;
  note?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "warn" | "accent";
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-6 ${
        tone === "warn" ? "border-amber-300/70 dark:border-amber-500/30" : tone === "accent" ? "border-primary/40" : ""
      } ${className}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {note && <span className="text-[13px] text-muted-foreground">{note}</span>}
        <div className="flex-1" />
        {action}
      </div>
      {children}
    </section>
  );
}
