import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import { loadStack, repoRoot, type ServiceDef } from "./config.js";

export type Status = "running" | "starting" | "stopped" | "failed";

export interface ServiceState {
  name: string;
  label: string;
  description: string;
  port: number;
  status: Status;
  /** Set when the last start attempt ended without the port ever opening. */
  error?: string;
}

export interface DependencyState {
  name: string;
  label: string;
  description: string;
  port: number;
  required: boolean;
  downMessage?: string;
  up: boolean;
  /** What it is actually doing, for a dependency that can say more than "the port is open". */
  detail?: string;
  /** Listening, but not usable -- Qdrant running with nothing indexed answers every lookup emptily. */
  degraded?: boolean;
}

export interface LogLine {
  service: string;
  text: string;
  at: number;
}

type Entry = ServiceDef & { isFrontend?: boolean };

const LOG_LIMIT = 2000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** How much of an existing log file to show the first time it is seen. */
const SEED_BYTES = 24_000;
/**
 * Drop ANSI colour codes. Vite and Maven colour their output, and in a plain log view the codes
 * render as bracket-and-digit gibberish around every word.
 *
 * Written as a scan rather than a regex so no escaped bracket has to survive being edited.
 */
function stripAnsi(text: string): string {
  const ESC = 27;
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === ESC && text[i + 1] === "[") {
      i += 2;
      while (i < text.length && !isLetter(text[i])) i++;
      continue; // the loop's own i++ steps past the terminating letter
    }
    out += text[i];
  }
  return out;
}

function isLetter(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
}

/** Is anything listening on this port? The only honest answer to "is it running?". */
export function probe(port: number, timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (up: boolean) => {
      socket.destroy();
      resolve(up);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, "127.0.0.1");
  });
}

/** Long enough for a cold start off disk, short enough that a broken one does not hold the stack. */
const DEPENDENCY_START_TIMEOUT_MS = 20_000;

/** Read from the corpus manifest, so the app and the indexer cannot disagree about the name. */
function guidanceCollection(): string {
  const fallback = "jarvis_financial_guidance";
  try {
    const raw = fs.readFileSync(path.join(repoRoot(), "corpus", "manifest.json"), "utf8");
    return (JSON.parse(raw) as { collection?: string }).collection ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Asks a running dependency whether it can actually serve anything.
 *
 * Only Qdrant needs this today. It is the one piece of the stack that fails silently: with no
 * collection, or an empty one, every guidance lookup returns no hits and the assistant simply
 * stops citing sources -- no error anywhere, and a green dot saying all is well.
 */
const DETAIL_PROBES: Record<string, (port: number) => Promise<Partial<DependencyState>>> = {
  qdrant: async (port) => {
    const collection = guidanceCollection();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/collections/${collection}`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.status === 404) {
        return { detail: `No "${collection}" collection — run the indexer`, degraded: true };
      }
      if (!res.ok) {
        return { detail: `Qdrant answered ${res.status}`, degraded: true };
      }
      const body = (await res.json()) as { result?: { points_count?: number } };
      const points = body.result?.points_count ?? 0;
      return points > 0
        ? { detail: `${points.toLocaleString()} guidance chunks indexed` }
        : { detail: "Collection is empty — run the indexer", degraded: true };
    } catch {
      return { detail: "Listening, but its API did not answer", degraded: true };
    }
  },
};

/**
 * Kill whatever holds a port.
 *
 * The Java processes are grandchildren of the mvnw wrapper, so killing the child we spawned is not
 * enough. After a crash or an earlier run there may be no child of ours at all. The port is the
 * thing that actually has to be free, so the port is what we go by.
 */
function freePort(port: number): Promise<void> {
  return new Promise((resolve) => {
    const script =
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ` +
      "Select-Object -ExpandProperty OwningProcess -Unique | " +
      "ForEach-Object { try { Stop-Process -Id $_ -Force -ErrorAction Stop } catch {} }";
    const ps = spawn("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true });
    ps.once("exit", () => resolve());
    ps.once("error", () => resolve());
  });
}

export class Supervisor extends EventEmitter {
  private children = new Map<string, ChildProcess>();
  private status = new Map<string, Status>();
  private errors = new Map<string, string>();
  private logs: LogLine[] = [];
  private busy = false;
  private tailPos = new Map<string, number>();
  private tailTimer?: NodeJS.Timeout;

  /** Every backend service plus the web app, supervised alike but started with npm. */
  entries(): Entry[] {
    const stack = loadStack();
    return [...stack.services, { ...stack.frontend, n: 99, wait: 0, isFrontend: true }];
  }

  recentLogs(): LogLine[] {
    return this.logs;
  }

  clearLogs(): void {
    this.logs = [];
    this.emit("log");
  }

  isBusy(): boolean {
    return this.busy;
  }

  async state(): Promise<ServiceState[]> {
    const entries = this.entries();
    const up = await Promise.all(entries.map((e) => probe(e.port)));
    return entries.map((e, i) => ({
      name: e.name,
      label: e.label,
      description: e.description,
      port: e.port,
      // A port that answers is running, whoever started it. That includes a stack that was already
      // up before this window opened, which is why status is not read from our bookkeeping first.
      status: up[i] ? "running" : (this.status.get(e.name) ?? "stopped"),
      error: up[i] ? undefined : this.errors.get(e.name),
    }));
  }

  /**
   * Postgres, Ollama and Qdrant, which the stack needs but does not own. Watched, never started:
   * they run in their own right, and starting them is not this window's business.
   *
   * An open port is only the first question. Where a dependency can answer the second one -- is it
   * actually able to serve anything? -- we ask, because a green dot on an empty Qdrant would say
   * the guidance lookups are fine when every one of them is quietly coming back with nothing.
   */
  async dependencies(): Promise<DependencyState[]> {
    const deps = loadStack().dependencies;
    const up = await Promise.all(deps.map((d) => probe(d.port)));
    return Promise.all(
      deps.map(async (d, i) => {
        const state: DependencyState = { ...d, up: up[i] };
        const detail = up[i] ? DETAIL_PROBES[d.name] : undefined;
        return detail ? { ...state, ...(await detail(d.port)) } : state;
      }),
    );
  }


  /**
   * Feed the log panel from the files under <repo>\logs.
   *
   * The Control Center is not always what started a service -- start-jarvis.ps1 may have, or an
   * earlier run of this app, or a terminal. Watching our own child pipes would show nothing in all
   * of those cases, which is exactly what it did. The files are the one place every launcher
   * already writes, so read those and it stops mattering who started what.
   */
  startTailing(): void {
    if (this.tailTimer) return;
    this.tailTimer = setInterval(() => void this.pumpFiles(), 1000);
    void this.pumpFiles();
  }

  stopTailing(): void {
    if (this.tailTimer) clearInterval(this.tailTimer);
    this.tailTimer = undefined;
  }

  private logFiles(): { service: string; file: string }[] {
    const dir = path.join(repoRoot(), "logs");
    return this.entries().flatMap((e) => [
      { service: e.name, file: path.join(dir, `${e.name}.log`) },
      // start-jarvis.ps1 splits stderr into its own file; both belong to the same service.
      { service: e.name, file: path.join(dir, `${e.name}.err.log`) },
    ]);
  }

  private async pumpFiles(): Promise<void> {
    let changed = false;
    for (const { service, file } of this.logFiles()) {
      try {
        const stat = await fsp.stat(file);
        let pos = this.tailPos.get(file);
        if (pos === undefined) {
          // First sight of a file: show its tail, not everything it has ever held.
          pos = Math.max(0, stat.size - SEED_BYTES);
        } else if (stat.size < pos) {
          // Truncated or replaced -- a fresh launcher run wipes these. Start over.
          pos = 0;
        }
        if (stat.size <= pos) {
          this.tailPos.set(file, pos);
          continue;
        }
        const handle = await fsp.open(file, "r");
        const length = stat.size - pos;
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, pos);
        await handle.close();

        const text = buffer.toString("utf8", 0, bytesRead);
        // Hold back a partial last line so it is printed once, whole, on the next pass.
        const cut = text.lastIndexOf("\n");
        if (cut < 0) {
          this.tailPos.set(file, pos);
          continue;
        }
        const complete = text.slice(0, cut + 1);
        this.tailPos.set(file, pos + Buffer.byteLength(complete, "utf8"));
        for (const raw of complete.split(/\r?\n/)) {
          const line = stripAnsi(raw);
          if (!line.length) continue;
          this.logs.push({ service, text: line, at: Date.now() });
          changed = true;
        }
      } catch {
        // Not written yet, or being rotated. Nothing to do but look again next second.
      }
    }
    if (changed) {
      if (this.logs.length > LOG_LIMIT) this.logs.splice(0, this.logs.length - LOG_LIMIT);
      this.emit("log");
    }
  }
  private log(service: string, text: string): void {
    for (const line of text.split(/\r?\n/)) {
      if (!line.length) continue;
      this.logs.push({ service, text: line, at: Date.now() });
    }
    if (this.logs.length > LOG_LIMIT) this.logs.splice(0, this.logs.length - LOG_LIMIT);
    this.emit("log");
  }

  private spawnOne(entry: Entry): void {
    const root = repoRoot();
    const child = entry.isFrontend
      ? spawn("cmd.exe", ["/c", "npm.cmd", "run", "dev"], {
          cwd: path.join(root, "frontend"),
          windowsHide: true,
        })
      : spawn(
          "cmd.exe",
          ["/c", path.join(root, "services", "mvnw.cmd"), "-pl", entry.name, "spring-boot:run"],
          { cwd: path.join(root, "services"), windowsHide: true },
        );

    this.children.set(entry.name, child);
    this.status.set(entry.name, "starting");
    this.errors.delete(entry.name);

    // Straight to the same file the other launchers write, so the tailer above is the only thing
    // that ever feeds the log panel and there is no second, divergent copy in memory.
    const logDir = path.join(root, "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const sink = fs.createWriteStream(path.join(logDir, `${entry.name}.log`), { flags: "a" });
    child.stdout?.pipe(sink);
    child.stderr?.pipe(sink);
    child.once("close", () => sink.end());
    child.once("error", (e) => this.log(entry.name, `[control-center] ${e.message}`));
    child.once("exit", (code) => {
      this.children.delete(entry.name);
      // An exit only counts as a failure while we were still waiting for the port. A restart or a
      // deliberate stop kills the process on purpose and has already set the status.
      if (this.status.get(entry.name) === "starting") {
        this.status.set(entry.name, "failed");
        this.errors.set(entry.name, `exited with code ${code}`);
      }
      this.emit("state");
    });
    this.emit("state");
  }

  /** Hold "starting" until the port actually answers, so the badge never lies. */
  private async awaitPort(entry: Entry, timeoutMs = 180_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await probe(entry.port)) {
        this.status.set(entry.name, "running");
        this.emit("state");
        return true;
      }
      if (this.status.get(entry.name) === "failed") return false;
      await sleep(1000);
    }
    this.status.set(entry.name, "failed");
    this.errors.set(entry.name, "did not open its port in time");
    this.emit("state");
    return false;
  }

  /**
   * Bring up everything that is not already up.
   *
   * Deliberately not a restart: opening the Control Center must never disturb services that are
   * already serving. Order matters -- Eureka first so the rest register cleanly, the gateway last
   * -- and the head start between them is only paid when we actually started something, and is cut
   * short as soon as the port answers.
   */
  async startAll(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.emit("state");
    try {
      // Bring up what we know how to start before deciding anything is missing.
      await this.startDependencies();

      // Without Postgres every service dies on its first migration, and eight failing services are a
      // far worse thing to hand someone than one clear line saying what is missing.
      const missing = (await this.dependencies()).filter((d) => d.required && !d.up);
      if (missing.length) {
        for (const d of missing) {
          this.log("control-center", `[control-center] ${d.label} is not listening on ${d.port} - nothing started`);
        }
        return;
      }

      const started: Entry[] = [];
      for (const entry of this.entries()) {
        if (await probe(entry.port)) continue;
        this.log(entry.name, `[control-center] starting on port ${entry.port}`);
        this.spawnOne(entry);
        started.push(entry);
        if (entry.wait > 0) {
          const until = Date.now() + entry.wait * 1000;
          while (Date.now() < until && !(await probe(entry.port))) await sleep(500);
        }
      }
      await Promise.all(started.map((e) => this.awaitPort(e)));
    } finally {
      this.busy = false;
      this.emit("state");
    }
  }

  /**
   * Start the dependencies that declare how to be started, and only those.
   *
   * Started detached and deliberately never stopped again: a store outlives the stack that reads
   * it, and on this machine Qdrant also holds collections belonging to other projects, so tearing
   * it down with the stack would take those with it.
   */
  private async startDependencies(): Promise<void> {
    for (const dep of loadStack().dependencies) {
      if (!dep.start || (await probe(dep.port))) continue;

      const exe = dep.start.command;
      if (!fs.existsSync(exe)) {
        this.log("control-center", `[control-center] ${dep.label}: ${exe} not found - skipped`);
        continue;
      }

      this.log("control-center", `[control-center] starting ${dep.label} on port ${dep.port}`);
      try {
        const child = spawn(exe, dep.start.args ?? [], {
          cwd: dep.start.cwd ?? path.dirname(exe),
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        child.unref();
      } catch (e) {
        this.log("control-center", `[control-center] ${dep.label} would not start: ${String(e)}`);
        continue;
      }

      const until = Date.now() + DEPENDENCY_START_TIMEOUT_MS;
      while (Date.now() < until && !(await probe(dep.port))) await sleep(500);
      this.log(
        "control-center",
        (await probe(dep.port))
          ? `[control-center] ${dep.label} is up`
          : `[control-center] ${dep.label} did not open port ${dep.port} - carrying on without it`,
      );
    }
  }

  async restart(name: string): Promise<void> {
    const entry = this.entries().find((e) => e.name === name);
    if (!entry) return;
    this.log(name, "[control-center] restarting");
    this.children.get(name)?.kill();
    this.status.set(name, "stopped");
    await freePort(entry.port);
    await sleep(500);
    this.spawnOne(entry);
    await this.awaitPort(entry);
  }

  async stopAll(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.emit("state");
    try {
      for (const entry of this.entries()) {
        this.children.get(entry.name)?.kill();
        this.status.set(entry.name, "stopped");
        await freePort(entry.port);
      }
      this.children.clear();
      this.log("control-center", "[control-center] all services stopped");
    } finally {
      this.busy = false;
      this.emit("state");
    }
  }

  /** On quit, the processes we spawned are ours to take down with us. */
  shutdown(): void {
    for (const child of this.children.values()) child.kill();
    this.children.clear();
  }
}
