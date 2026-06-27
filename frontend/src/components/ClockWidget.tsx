import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, ChevronRight } from "lucide-react";
import { dueLabel, REMINDER_META, upcomingReminders } from "@/lib/sample";
import { useReminders } from "@/lib/store";
import { formatINR } from "@/lib/format";

const pad = (n: number) => String(n).padStart(2, "0");

/** A clock hand from the centre at `deg` (0 = up) with length `len`. */
function Hand({ deg, len, width, color, glow }: { deg: number; len: number; width: number; color: string; glow?: boolean }) {
  const cx = 60;
  const cy = 60;
  const rad = ((deg - 90) * Math.PI) / 180;
  const x = cx + len * Math.cos(rad);
  const y = cy + len * Math.sin(rad);
  return (
    <line
      x1={cx}
      y1={cy}
      x2={x}
      y2={y}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      style={glow ? { filter: "drop-shadow(0 0 4px var(--primary))" } : undefined}
    />
  );
}

function Dial({ h, m, s }: { h: number; m: number; s: number }) {
  const cx = 60;
  const cy = 60;
  const r = 50;
  const circ = 2 * Math.PI * r;
  const frac = s / 60;
  const hourDeg = ((h % 12) + m / 60) * 30;
  const minDeg = (m + s / 60) * 6;
  const secDeg = s * 6;
  const secRad = ((secDeg - 90) * Math.PI) / 180;
  const tipX = cx + 38 * Math.cos(secRad);
  const tipY = cy + 38 * Math.sin(secRad);

  return (
    <svg viewBox="0 0 120 120" className="size-28 sm:size-32" aria-hidden>
      {/* tick marks */}
      {Array.from({ length: 60 }).map((_, i) => {
        const a = (i * 6 * Math.PI) / 180;
        const major = i % 5 === 0;
        const inner = major ? 44 : 47;
        const outer = 50;
        return (
          <line
            key={i}
            x1={cx + inner * Math.sin(a)}
            y1={cy - inner * Math.cos(a)}
            x2={cx + outer * Math.sin(a)}
            y2={cy - outer * Math.cos(a)}
            stroke="var(--muted-foreground)"
            strokeOpacity={major ? 0.55 : 0.25}
            strokeWidth={major ? 1.6 : 1}
            strokeLinecap="round"
          />
        );
      })}
      {/* track + seconds progress arc */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={2.5} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - frac)}
        transform={`rotate(-90 ${cx} ${cy})`}
        // At the 59→0 wrap, snap (no transition) so the arc doesn't visibly retrace backwards.
        style={{ transition: s === 0 ? "none" : "stroke-dashoffset 0.3s linear" }}
      />
      {/* hands: hour (short/thick), minute (long), second (thin, primary) */}
      <Hand deg={hourDeg} len={24} width={3.5} color="var(--foreground)" />
      <Hand deg={minDeg} len={34} width={2.5} color="var(--foreground)" />
      <g style={{ transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)" }}>
        <Hand deg={secDeg} len={38} width={1.6} color="var(--primary)" glow />
        <circle cx={tipX} cy={tipY} r={3.5} fill="var(--primary)" style={{ filter: "drop-shadow(0 0 5px var(--primary))" }} />
      </g>
      <circle cx={cx} cy={cy} r={4} fill="var(--foreground)" />
      <circle cx={cx} cy={cy} r={1.8} fill="var(--primary)" />
    </svg>
  );
}

export default function ClockWidget() {
  const [now, setNow] = useState(() => new Date());
  const navigate = useNavigate();
  const { items } = useReminders();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const h = now.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  const date = now.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const upcoming = upcomingReminders(items, 50, 5); // everything due in the next 5 days

  return (
    <button
      type="button"
      onClick={() => navigate("/calendar")}
      title="Open calendar"
      className="group w-full rounded-2xl border bg-gradient-to-br from-card to-primary/5 p-5 text-left ring-1 ring-primary/15 transition-shadow hover:ring-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-stretch sm:justify-between">
        {/* Left: date + reminders */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-foreground">
            <CalendarDays className="size-4 text-primary" />
            <span className="text-base font-semibold tracking-tight">{date}</span>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Upcoming reminders · next 5 days
              </span>
              <span className="inline-flex items-center text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
                Calendar <ChevronRight className="size-3" />
              </span>
            </div>
            <div className="mt-2 space-y-1.5">
              {upcoming.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
                  No payments due in the next 5 days. You're all caught up. 🎉
                </p>
              ) : (
                upcoming.map((r) => (
                  <div
                    key={`${r.id}-${r.occursOn}`}
                    className="flex items-center gap-2.5 rounded-lg border bg-background/50 px-2.5 py-1.5"
                  >
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: REMINDER_META[r.type].color }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{r.title}</div>
                      <div className="text-xs text-muted-foreground">{dueLabel(r.occursOn)}</div>
                    </div>
                    {r.amount != null && (
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{formatINR(r.amount)}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: animated dial with the time below it */}
        <div className="flex flex-col items-center justify-center gap-2 sm:pl-4">
          <Dial h={now.getHours()} m={now.getMinutes()} s={now.getSeconds()} />
          <div className="flex items-baseline gap-1 font-mono tabular-nums">
            <span className="text-2xl font-bold text-foreground">{pad(h % 12 || 12)}</span>
            <span className="text-xl text-muted-foreground">:</span>
            <span className="text-2xl font-bold text-foreground">{pad(now.getMinutes())}</span>
            <span className="text-xl text-muted-foreground">:</span>
            <span
              className="text-2xl font-bold text-primary"
              style={{ textShadow: "0 0 16px color-mix(in oklab, var(--primary) 55%, transparent)" }}
            >
              {pad(now.getSeconds())}
            </span>
            <span className="pl-1 text-xs font-semibold text-muted-foreground">{ampm}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
