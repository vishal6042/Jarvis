import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  api,
  formatBytes,
  formatUptime,
  useHealth,
  useSettings,
  useStack,
  type BackupInfo,
  type DependencyState,
  type ServiceState,
} from "./api";
import { DependencyStrip, LogPanel, Ring, ServiceCard } from "./components";
import * as Icon from "./icons";
import JarvisLogo from "./logo";

type Page = "home" | "services" | "logs" | "backup" | "settings" | "about";

const NAV: { id: Page; label: string; icon: (p: { size?: number }) => ReactElement }[] = [
  { id: "home", label: "Home", icon: Icon.Home },
  { id: "services", label: "Services", icon: Icon.Stack },
  { id: "logs", label: "Logs", icon: Icon.Doc },
  { id: "backup", label: "Backup", icon: Icon.Archive },
  { id: "settings", label: "Settings", icon: Icon.Gear },
  { id: "about", label: "About", icon: Icon.Info },
];

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const { services, dependencies, logs, busy, loaded, refresh } = useStack();
  const health = useHealth();
  const { settings, reload: reloadSettings } = useSettings();
  // Each page starts at its own top rather than inheriting wherever the last one was scrolled to.
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    if (main.current) main.current.scrollTop = 0;
  }, [page]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <JarvisLogo size={42} className="brand-mark" />
          <div>
            <div className="brand-name">JARVIS</div>
            <div className="brand-sub">Control Center</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => setPage(item.id)}
            >
              <item.icon size={19} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div>Jarvis v{settings?.version ?? "1.0.0"}</div>
          <div>Smarter Tools. Bigger Possibilities.</div>
        </div>
      </aside>

      <main className="main" ref={main}>
        {page === "home" && (
          <Home
            services={services}
            dependencies={dependencies}
            logs={logs}
            busy={busy}
            loaded={loaded}
            health={health}
            onChanged={refresh}
            onSeeAll={() => setPage("services")}
          />
        )}
        {page === "services" && (
          <Services services={services} dependencies={dependencies} busy={busy} onChanged={refresh} />
        )}
        {page === "logs" && <Logs services={services} logs={logs} />}
        {page === "backup" && <Backup />}
        {page === "settings" && <Settings settings={settings} reload={reloadSettings} />}
        {page === "about" && <About settings={settings} />}
      </main>
    </div>
  );
}

function summarise(
  services: ServiceState[],
  dependencies: DependencyState[],
  busy: boolean,
  loaded: boolean,
) {
  if (!loaded) {
    return {
      title: "Checking…",
      sub: "Reading the ports to see what is already up.",
      pill: "busy" as const,
      pillText: "Checking",
    };
  }
  // A missing prerequisite outranks everything else: nothing can start, and saying so beats
  // letting someone press the button and watch eight services fail one after another.
  const blocking = dependencies.filter((d) => d.required && !d.up);
  if (blocking.length) {
    const names = blocking.map((d) => d.label).join(" and ");
    return {
      title: `${names} is not running`,
      sub: `Start ${names} first — every service needs it before it can come up.`,
      pill: "warn" as const,
      pillText: `${names} down`,
    };
  }
  const running = services.filter((s) => s.status === "running").length;
  const failed = services.filter((s) => s.status === "failed").length;
  if (busy) {
    return {
      title: "Starting up…",
      sub: `${running} of ${services.length} services are answering so far.`,
      pill: "busy" as const,
      pillText: "Starting",
    };
  }
  if (running === services.length && services.length > 0) {
    return {
      title: "All Systems Ready",
      sub: "Manage and monitor all Jarvis services from one place.",
      pill: "ok" as const,
      pillText: "All Systems Running",
    };
  }
  return {
    title: failed > 0 ? "Something needs a look" : "Not running",
    sub:
      failed > 0
        ? `${failed} service${failed === 1 ? "" : "s"} failed to start. Their logs say why.`
        : `${running} of ${services.length} services are running.`,
    pill: "warn" as const,
    pillText: `${running}/${services.length} running`,
  };
}

function Home({
  services,
  dependencies,
  logs,
  busy,
  loaded,
  health,
  onChanged,
  onSeeAll,
}: {
  services: ServiceState[];
  dependencies: DependencyState[];
  logs: ReturnType<typeof useStack>["logs"];
  busy: boolean;
  loaded: boolean;
  health: ReturnType<typeof useHealth>;
  onChanged: () => void;
  onSeeAll: () => void;
}) {
  const s = summarise(services, dependencies, busy, loaded);
  const allRunning = loaded && services.length > 0 && services.every((x) => x.status === "running");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{s.title}</h1>
          <p className="subtitle">{s.sub}</p>
        </div>
        <span className={`pill ${s.pill}`}>
          {s.pill === "ok" ? <Icon.Check size={17} /> : <Icon.Alert size={17} />}
          {s.pillText}
        </span>
      </div>

      <div className="actions">
        <button
          className={`action ${allRunning ? "" : "primary"}`}
          disabled={busy}
          onClick={() => void (allRunning ? api().stopAll() : api().startAll()).then(onChanged)}
        >
          <span className="action-icon">{allRunning ? <Icon.Square size={20} /> : <Icon.Play size={20} />}</span>
          <span>
            <span className="action-title">{allRunning ? "Stop All Services" : "Start All Services"}</span>
            <br />
            <span className="action-sub">
              {allRunning ? "Shut the whole stack down" : "Start whatever is not already running"}
            </span>
          </span>
        </button>
        <button className="action" onClick={() => void api().openWebApp()}>
          <span className="action-icon">
            <Icon.Globe size={20} />
          </span>
          <span>
            <span className="action-title">Open Web App</span>
            <br />
            <span className="action-sub">Launch Jarvis in your browser</span>
          </span>
        </button>
      </div>

      <DependencyStrip dependencies={dependencies} />

      <div className="section-head">
        <h2>Services</h2>
        <button className="link" onClick={onSeeAll}>
          View All Services <Icon.Arrow size={15} />
        </button>
      </div>
      {/* Shrinks and scrolls when the window is short, so the log panel below keeps its floor
          rather than being squeezed to nothing. */}
      <div className="grid shrink">
        {services.slice(0, 8).map((service) => (
          <ServiceCard key={service.name} service={service} onChanged={onChanged} />
        ))}
      </div>

      <div className="lower">
        <LogPanel logs={logs} services={services} />
        {/* Hugs its content rather than stretching to the log panel's height, which left a tall
            half-empty card on a maximised window. */}
        <div className="panel health">
          <div className="panel-head">
            <h2>System Health</h2>
          </div>
          <div className="rings">
            <Ring value={health?.cpu ?? 0} label="CPU" colour="var(--green)" />
            <Ring value={health?.memory ?? 0} label="RAM" colour="var(--blue)" />
            {/* Ollama runs on the GPU, so its load is the one that says whether the AI service is
                actually working. Hidden rather than shown as zero when no card reports one. */}
            {health?.gpu != null && <Ring value={health.gpu} label="GPU" colour="var(--violet)" />}
            <Ring value={health?.disk ?? 0} label="Disk" colour="var(--amber)" />
          </div>
          {health?.gpuName && (
            <div className="health-row">
              <Icon.Chart size={19} />
              <div style={{ minWidth: 0 }}>
                <div className="k">Graphics</div>
                <div className="v gpu-name">{health.gpuName}</div>
                {health.gpuMemory != null && (
                  <div className="k">{health.gpuMemory}% of its memory in use</div>
                )}
              </div>
            </div>
          )}
          <div className="health-row">
            <Icon.Clock size={19} />
            <div>
              <div className="k">Control Center open</div>
              <div className="v">{formatUptime(health?.uptime ?? 0)}</div>
            </div>
          </div>
          <div className="health-row">
            <Icon.Db size={19} />
            <div>
              <div className="k">Environment</div>
              <div className="v">{health?.environment ?? "Local"}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Services({
  services,
  dependencies,
  busy,
  onChanged,
}: {
  services: ServiceState[];
  dependencies: DependencyState[];
  busy: boolean;
  onChanged: () => void;
}) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Services</h1>
          <p className="subtitle">
            Every part of the stack, in the order it starts. Discovery goes first so the rest can
            register; the gateway is last.
          </p>
        </div>
        <button className="btn" disabled={busy} onClick={() => void api().stopAll().then(onChanged)}>
          Stop all
        </button>
      </div>
      <DependencyStrip dependencies={dependencies} />
      {/* Nine cards can outgrow a short window; this grid scrolls, the page around it does not. */}
      <div className="grid scroll">
        {services.map((service) => (
          <ServiceCard key={service.name} service={service} onChanged={onChanged} />
        ))}
      </div>
    </>
  );
}

function Logs({ services, logs }: { services: ServiceState[]; logs: ReturnType<typeof useStack>["logs"] }) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Logs</h1>
          <p className="subtitle">
            Everything the services have written, read straight from logs\ in the Jarvis folder -- so
            it does not matter whether this window started them or the launcher did.
          </p>
        </div>
      </div>
      <LogPanel logs={logs} services={services} tall />
    </>
  );
}

/**
 * Take a copy of everything, and put a copy back.
 *
 * <p>A restore never touches the database in use: it builds a new one beside it. Someone reaching
 * for this page is usually already having a bad day, and the worst thing it could do is make that
 * day worse by overwriting the only copy they had left.
 */
function Backup() {
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [busy, setBusy] = useState<"backup" | "restore" | null>(null);
  const [step, setStep] = useState("");
  const [done, setDone] = useState<ReactElement | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    void api().getBackupInfo().then(setInfo);
    return api().onBackupProgress(setStep);
  }, []);

  const reset = () => {
    setDone(null);
    setError("");
    setStep("");
  };

  const runBackup = async () => {
    reset();
    setBusy("backup");
    try {
      const result = await api().backup();
      if ("error" in result) setError(result.error);
      else if ("ok" in result) {
        setDone(
          <>
            Saved <strong>{result.file}</strong> — {formatBytes(result.bytes)} from the{" "}
            <code>{result.database}</code> database.
          </>,
        );
      }
    } finally {
      setBusy(null);
      setStep("");
    }
  };

  const runRestore = async (file?: string) => {
    reset();
    setBusy("restore");
    try {
      const result = await api().restore(file);
      if ("error" in result) setError(result.error);
      else if ("ok" in result) {
        setDone(
          <>
            Restored <strong>{result.from}</strong> into a new database, <code>{result.database}</code>.
            Your live database was not touched. To run the stack against the restored copy, set{" "}
            <code>JARVIS_DB_URL</code> to{" "}
            <code>
              jdbc:postgresql://{info?.host ?? "localhost"}:{info?.port ?? 5432}/{result.database}
            </code>{" "}
            and start the services again.
          </>,
        );
      }
    } finally {
      setBusy(null);
      setStep("");
    }
  };

  /** A drop is only a restore when it is one zip; anything else is almost certainly a mis-drop. */
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    const files = Array.from(e.dataTransfer.files);
    const zip = files.find((f) => f.name.toLowerCase().endsWith(".zip"));
    if (!zip) {
      setError("Drop the backup .zip itself — that was not one.");
      return;
    }
    void runRestore(api().pathForFile(zip));
  };

  const ready = !!info?.bin;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Backup</h1>
          <p className="subtitle">
            Every service keeps its data in one Postgres database, so one file holds all of it —
            accounts, transactions, investments, loans, reminders and saved conversations.
          </p>
        </div>
      </div>

      {info && !ready && (
        <div className="notice warn">
          <Icon.Alert size={17} />
          <div>
            PostgreSQL's command-line tools were not found, so nothing here can run. Install
            PostgreSQL 18, or point the Control Center at the bin folder.
            <button className="link" onClick={() => void api().choosePgBin().then(setInfo)}>
              Choose the bin folder <Icon.Arrow size={15} />
            </button>
          </div>
        </div>
      )}

      <div className="backup-grid">
        <div className="panel">
          <div className="panel-head">
            <h2>Back up</h2>
          </div>
          <div className="panel-body">
            <p className="prose">
              Writes a zip you choose the place for: the whole database, plus a small manifest
              saying when it was taken and by what.
            </p>
            <p className="prose dim">
              The guidance index in Qdrant is left out on purpose — it is rebuilt from{" "}
              <code>corpus/</code>, so a copy of it could only go stale.
            </p>
            <button
              className="action primary backup-go"
              disabled={!ready || busy !== null}
              onClick={() => void runBackup()}
            >
              <span className="action-icon">
                <Icon.Download size={20} />
              </span>
              <span>
                <span className="action-title">
                  {busy === "backup" ? "Backing up…" : "Back up now"}
                </span>
                <br />
                <span className="action-sub">Choose where to save the zip</span>
              </span>
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Restore</h2>
          </div>
          <div className="panel-body">
            <p className="prose">
              Reads a backup zip into a <strong>new</strong> database named for the day it was
              taken. Nothing in use is overwritten, so it is safe to try.
            </p>
            <div
              className={`dropzone${dragging ? " over" : ""}${busy ? " disabled" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => !busy && ready && void runRestore()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !busy && ready) void runRestore();
              }}
            >
              <Icon.Upload size={22} />
              <div>
                <div className="drop-title">
                  {busy === "restore" ? "Restoring…" : "Drop a backup zip here"}
                </div>
                <div className="drop-sub">or click to choose one</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {busy && step && (
        <div className="notice">
          <span className="spinner" />
          {step}
        </div>
      )}
      {error && (
        <div className="notice warn">
          <Icon.Alert size={17} />
          <div>{error}</div>
        </div>
      )}
      {done && (
        <div className="notice ok">
          <Icon.Check size={17} />
          <div>{done}</div>
        </div>
      )}

      {info && (
        <div className="panel">
          <div className="panel-head">
            <h2>What it reads</h2>
          </div>
          <div className="panel-body kv">
            <div className="k">Database</div>
            <div className="v">
              <code>
                {info.user}@{info.host}:{info.port}/{info.database}
              </code>
            </div>
            <div className="k">PostgreSQL tools</div>
            <div className="v">
              {info.bin ? (
                <>
                  <code>{info.bin}</code>
                  {info.version && <span className="dim"> · {info.version}</span>}
                </>
              ) : (
                <span className="warn-text">not found</span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Settings({
  settings,
  reload,
}: {
  settings: ReturnType<typeof useSettings>["settings"];
  reload: () => void;
}) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="subtitle">Where Jarvis lives, and how this window behaves.</p>
        </div>
      </div>
      <div className="panel">
        <div className="setting">
          <div className="setting-body">
            <div className="setting-title">Jarvis folder</div>
            <div className="setting-sub">
              The checkout the Control Center starts services from. It reads services.json here, so
              a service added to the stack shows up without changing this app.
            </div>
            <div className={`path${settings && !settings.repoRootValid ? " bad" : ""}`}>
              {settings?.repoRoot ?? "…"}
              {settings && !settings.repoRootValid && " — no services\\services.json here"}
            </div>
          </div>
          <button className="btn" onClick={() => void api().chooseRepoRoot().then(reload)}>
            <span style={{ display: "inline-flex", gap: 7, alignItems: "center" }}>
              <Icon.Folder size={15} /> Change
            </span>
          </button>
        </div>

        <div className="setting">
          <div className="setting-body">
            <div className="setting-title">Close button minimises to the tray</div>
            <div className="setting-sub">
              On, the close button hides this window and leaves the services running; reopen it from
              the tray icon, and quit properly from the tray menu. Off, closing the window quits the
              Control Center and takes the services it started with it.
            </div>
          </div>
          <button
            className="switch"
            data-on={settings?.minimiseToTray ? "true" : "false"}
            aria-label="Minimise to tray on close"
            onClick={() =>
              void api().setMinimiseToTray(!settings?.minimiseToTray).then(reload)
            }
          />
        </div>
      </div>
    </>
  );
}

function About({ settings }: { settings: ReturnType<typeof useSettings>["settings"] }) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>About</h1>
          <p className="subtitle">Jarvis Control Center</p>
        </div>
      </div>
      <div className="panel about">
        <p>
          One window for the Jarvis stack: eight Spring Boot services and the web app, started in
          the order they need, watched by their ports rather than by guesswork, with every log in
          one place.
        </p>
        <p>
          Starting only touches what is not already listening, so opening this window never
          disturbs a stack that is already serving.
        </p>
        <div className="health-row">
          <div>
            <div className="k">Control Center</div>
            <div className="v">v{settings?.version ?? "1.0.0"}</div>
          </div>
        </div>
        <div className="health-row">
          <div>
            <div className="k">Electron</div>
            <div className="v">{settings?.electron ?? "—"}</div>
          </div>
        </div>
        <div className="health-row">
          <div>
            <div className="k">Repository</div>
            <div className="v">
              <span className="about" onClick={() => void api().openExternal("https://github.com/vishal6042/Jarvis")}>
                <a>github.com/vishal6042/Jarvis</a>
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
