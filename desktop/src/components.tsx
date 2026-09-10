import { useEffect, useRef, useState } from "react";
import { api, formatTime, type DependencyState, type LogLine, type ServiceState, type Status } from "./api";
import * as Icon from "./icons";

const STATUS_LABEL: Record<Status, string> = {
  running: "Running",
  starting: "Starting",
  stopped: "Stopped",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`status ${status}`}>
      <span className="dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ServiceCard({ service, onChanged }: { service: ServiceState; onChanged: () => void }) {
  const [working, setWorking] = useState(false);
  const Glyph = Icon.serviceIcon(service.name);
  const isWeb = service.name === "frontend";

  const restart = async () => {
    setWorking(true);
    try {
      await api().restart(service.name);
    } finally {
      setWorking(false);
      onChanged();
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-icon">
          <Glyph size={19} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="card-title">{service.label}</div>
          <div className="card-sub">{service.description}</div>
        </div>
      </div>
      <div className="card-foot">
        <StatusBadge status={working ? "starting" : service.status} />
        {isWeb && service.status === "running" ? (
          <button className="btn" onClick={() => void api().openWebApp()}>
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <Icon.External size={14} /> Open
            </span>
          </button>
        ) : (
          <button className="btn" onClick={() => void restart()} disabled={working}>
            {service.status === "running" ? "Restart" : "Start"}
          </button>
        )}
      </div>
      {service.error && service.status === "failed" && (
        <div className="card-error">
          Port {service.port} &middot; {service.error}
        </div>
      )}
    </div>
  );
}

export function LogView({ logs, tall }: { logs: LogLine[]; tall?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Follow the tail, unless the reader has scrolled up to look at something.
  useEffect(() => {
    const el = box.current;
    if (el && pinned.current && logs.length) el.scrollTop = el.scrollHeight;
  }, [logs]);

  const onScroll = () => {
    const el = box.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  return (
    <div className={`logs${tall ? " tall" : ""}`} ref={box} onScroll={onScroll}>
      {logs.length === 0 ? (
        <div className="log-empty">Nothing yet. Start the services and their output lands here.</div>
      ) : (
        logs.map((l, i) => (
          <div className="log-line" key={`${l.at}-${i}`}>
            <span className="log-time">[{formatTime(l.at)}]</span>{" "}
            <span className="log-svc">[{l.service}]</span> {l.text}
          </div>
        ))
      )}
    </div>
  );
}

export function LogPanel({
  logs,
  services,
  tall,
}: {
  logs: LogLine[];
  services: ServiceState[];
  tall?: boolean;
}) {
  const [filter, setFilter] = useState("all");
  const shown = filter === "all" ? logs : logs.filter((l) => l.service === filter);

  return (
    <div className={`panel${tall ? " grow" : ""}`}>
      <div className="panel-head">
        <h2>Logs</h2>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All services</option>
          {services.map((s) => (
            <option key={s.name} value={s.name}>
              {s.label}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => void api().clearLogs()}>
          Clear logs
        </button>
      </div>
      <LogView logs={shown} tall={tall} />
    </div>
  );
}

export function Ring({ value, label, colour }: { value: number; label: string; colour: string }) {
  const r = 34;
  const circumference = 2 * Math.PI * r;
  const filled = (Math.min(100, Math.max(0, value)) / 100) * circumference;
  return (
    <div className="ring">
      <div className="ring-wrap">
        <svg width={92} height={92}>
          <circle cx={46} cy={46} r={r} fill="none" stroke="#ffffff14" strokeWidth={8} />
          <circle
            cx={46}
            cy={46}
            r={r}
            fill="none"
            stroke={colour}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            transform="rotate(-90 46 46)"
          />
        </svg>
        {/* Centred inside the donut rather than nudged with margins, so the label and the number
            stay put whatever the value is. */}
        <div className="ring-text">
          <div className="ring-label">{label}</div>
          <div className="ring-value">{value}%</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Postgres and Ollama. Not part of the stack and not ours to start, but the stack cannot run
 * without the first and loses its AI features without the second, so they are worth a glance
 * before anyone wonders why eight services failed at once.
 */
export function DependencyStrip({ dependencies }: { dependencies: DependencyState[] }) {
  if (dependencies.length === 0) return null;
  return (
    <div className="deps">
      {dependencies.map((d) => (
        <div className="dep" key={d.name}>
          {/* Up-but-degraded gets its own colour: a green dot on an empty Qdrant would claim the
              guidance lookups are fine when every one of them is coming back with nothing. */}
          <span
            className={`status ${
              !d.up ? (d.required ? "failed" : "stopped") : d.degraded ? "degraded" : "running"
            }`}
          >
            <span className="dot" />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="dep-title">
              {d.label} <span className="dep-port">:{d.port}</span>
            </div>
            <div className={`dep-sub${d.up && d.degraded ? " dep-warn" : ""}`}>
              {d.up
                ? (d.detail ?? d.description)
                : (d.downMessage ?? "Not running")}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
