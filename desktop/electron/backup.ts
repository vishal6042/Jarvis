import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readSettings } from "./config.js";

/**
 * Backing the household's money up, and putting it back.
 *
 * <p>Everything a person would grieve losing lives in one Postgres database — every service owns a
 * schema inside it — so a backup is a {@code pg_dump} of that database, zipped with a manifest
 * saying what it is and what made it. Nothing here talks to the services: they can be down, or
 * half-migrated, and the dump is still exactly what is on disk.
 *
 * <p>Restore always creates a NEW database and never touches the live one. A restore is something
 * a person reaches for when they are already having a bad day; it must not be able to make that day
 * worse. What it hands back is the new database's name, and pointing the stack at it is a separate,
 * deliberate step.
 *
 * <p>Qdrant is deliberately not in here. It holds the published-guidance index, which is rebuilt
 * from {@code corpus/} by design — backing up a derived index would only let it drift.
 */

export interface BackupProgress {
  /** What is happening now, in words meant for the window rather than a log. */
  step: string;
}

export interface BackupResult {
  file: string;
  bytes: number;
  database: string;
}

export interface RestoreResult {
  database: string;
  /** What the backup said about itself, so the UI can show what was just restored. */
  createdAt: string;
  from: string;
}

export interface ToolInfo {
  /** The PostgreSQL bin directory the dump and restore will use, null when none was found. */
  bin: string | null;
  version: string | null;
  database: string;
  host: string;
  port: number;
  user: string;
}

/** What the manifest records, so a restore can check the zip is ours before it acts. */
interface Manifest {
  format: "jarvis-backup";
  version: 1;
  createdAt: string;
  database: string;
  /** The pg_dump that wrote it: a dump cannot be read by an older pg_restore. */
  pgDumpVersion: string;
  appVersion: string;
  dump: string;
}

const MANIFEST = "manifest.json";
const DUMP = "jarvis.dump";

/* ------------------------------------------------------------------ where things are */

/**
 * The services all read {@code JARVIS_DB_URL} with the same default, so this reads it the same way
 * rather than keeping a second copy of the connection that could drift out of step with them.
 */
function connection() {
  const url = process.env.JARVIS_DB_URL ?? "jdbc:postgresql://localhost:5432/jarvis";
  let host = "localhost";
  let port = 5432;
  let database = "jarvis";
  try {
    const parsed = new URL(url.replace(/^jdbc:/, ""));
    host = parsed.hostname || host;
    port = parsed.port ? Number(parsed.port) : port;
    database = parsed.pathname.replace(/^\//, "") || database;
  } catch {
    // A malformed URL falls back to the same defaults the services would use.
  }
  return {
    host,
    port,
    database,
    user: process.env.DB_USER ?? "jarvis",
    password: process.env.DB_PASSWORD ?? "jarvis",
  };
}

/**
 * Where PostgreSQL keeps its command-line tools. A remembered setting wins, then the standard
 * install paths newest-first, then whatever is on PATH — so the ordinary Windows install needs no
 * configuring, and an unusual one can be pointed at once and remembered.
 */
export function findPgBin(): string | null {
  const candidates: string[] = [];
  const remembered = readSettings().pgBin;
  if (remembered) candidates.push(remembered);
  if (process.env.JARVIS_PG_BIN) candidates.push(process.env.JARVIS_PG_BIN);
  for (const version of [18, 17, 16, 15, 14]) {
    candidates.push(`C:\\Program Files\\PostgreSQL\\${version}\\bin`);
  }
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, exe("pg_dump")))) return dir;
  }
  return null;
}

function exe(tool: string): string {
  return process.platform === "win32" ? `${tool}.exe` : tool;
}

function tool(bin: string | null, name: string): string {
  // With no install found, the bare name still works when the tools happen to be on PATH.
  return bin ? path.join(bin, exe(name)) : name;
}

export async function toolInfo(): Promise<ToolInfo> {
  const bin = findPgBin();
  const c = connection();
  let version: string | null = null;
  if (bin) {
    const out = await run(tool(bin, "pg_dump"), ["--version"], {});
    version = out.code === 0 ? out.stdout.trim() : null;
  }
  return { bin, version, database: c.database, host: c.host, port: c.port, user: c.user };
}

/* ------------------------------------------------------------------ running things */

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (e) => resolve({ code: -1, stdout, stderr: e.message }));
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

/**
 * Zip and unzip through PowerShell rather than a library: the Control Center already shells out to
 * it to manage the stack, and a backup feature is not worth a dependency that has to be packaged,
 * kept current and trusted with the one file a person cannot afford to have written wrongly.
 */
function powershell(script: string): Promise<RunResult> {
  return run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {});
}

/** PowerShell string literals escape a quote by doubling it; paths are otherwise passed as-is. */
function ps(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/* ------------------------------------------------------------------ backup */

export async function backup(
  target: string,
  appVersion: string,
  onProgress: (p: BackupProgress) => void,
): Promise<BackupResult> {
  const bin = findPgBin();
  if (!bin) {
    throw new Error(
      "PostgreSQL's command-line tools were not found. Install PostgreSQL 18, or set the bin " +
        "folder on the Settings page.",
    );
  }
  const c = connection();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-backup-"));

  try {
    onProgress({ step: `Reading the ${c.database} database…` });
    // Custom format: compressed, and it restores into a database of any name, which is the whole
    // point here. Plain SQL would carry the old database name through into the restore.
    const dumped = await run(
      tool(bin, "pg_dump"),
      [
        "-h", c.host,
        "-p", String(c.port),
        "-U", c.user,
        "-d", c.database,
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "-f", path.join(work, DUMP),
      ],
      { PGPASSWORD: c.password },
    );
    if (dumped.code !== 0) {
      throw new Error(`pg_dump failed: ${firstLine(dumped.stderr) || `exit ${dumped.code}`}`);
    }

    const versionOut = await run(tool(bin, "pg_dump"), ["--version"], {});
    const manifest: Manifest = {
      format: "jarvis-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      database: c.database,
      pgDumpVersion: versionOut.stdout.trim(),
      appVersion,
      dump: DUMP,
    };
    fs.writeFileSync(path.join(work, MANIFEST), JSON.stringify(manifest, null, 2), "utf8");

    onProgress({ step: "Packing it into a zip…" });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // -Force so choosing an existing name in the save dialog does what the dialog promised.
    const zipped = await powershell(
      `Compress-Archive -Path ${ps(path.join(work, "*"))} -DestinationPath ${ps(target)} -Force`,
    );
    if (zipped.code !== 0 || !fs.existsSync(target)) {
      throw new Error(`Could not write the zip: ${firstLine(zipped.stderr) || `exit ${zipped.code}`}`);
    }

    return { file: target, bytes: fs.statSync(target).size, database: c.database };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ restore */

export async function restore(
  zipFile: string,
  onProgress: (p: BackupProgress) => void,
): Promise<RestoreResult> {
  const bin = findPgBin();
  if (!bin) {
    throw new Error(
      "PostgreSQL's command-line tools were not found. Install PostgreSQL 18, or set the bin " +
        "folder on the Settings page.",
    );
  }
  if (!fs.existsSync(zipFile)) {
    throw new Error("That file no longer exists.");
  }
  const c = connection();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-restore-"));

  try {
    onProgress({ step: "Opening the zip…" });
    const opened = await powershell(
      `Expand-Archive -Path ${ps(zipFile)} -DestinationPath ${ps(work)} -Force`,
    );
    if (opened.code !== 0) {
      throw new Error(`Could not open the zip: ${firstLine(opened.stderr) || `exit ${opened.code}`}`);
    }

    // Refuse anything that is not one of ours before going anywhere near the database.
    const manifestFile = path.join(work, MANIFEST);
    if (!fs.existsSync(manifestFile)) {
      throw new Error("That zip is not a Jarvis backup — it has no manifest.json inside it.");
    }
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as Manifest;
    if (manifest.format !== "jarvis-backup") {
      throw new Error("That zip is not a Jarvis backup.");
    }
    const dumpFile = path.join(work, manifest.dump ?? DUMP);
    if (!fs.existsSync(dumpFile)) {
      throw new Error("The backup is incomplete — the database dump is missing from it.");
    }

    onProgress({ step: "Creating a new database…" });
    const name = await createDatabase(bin, c, nameFor(manifest.createdAt));

    onProgress({ step: `Restoring into ${name}…` });
    const restored = await run(
      tool(bin, "pg_restore"),
      [
        "-h", c.host,
        "-p", String(c.port),
        "-U", c.user,
        "-d", name,
        "--no-owner",
        "--no-privileges",
        dumpFile,
      ],
      { PGPASSWORD: c.password },
    );
    if (restored.code !== 0) {
      // pg_restore says "errors ignored on restore: N" and exits non-zero for things as harmless
      // as a missing role, so the message matters more than the code. It is handed on whole.
      throw new Error(
        `Restored into ${name} with errors: ${firstLine(restored.stderr) || `exit ${restored.code}`}`,
      );
    }

    return { database: name, createdAt: manifest.createdAt, from: path.basename(zipFile) };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Make the database to restore into, named for when the backup was taken. Restoring the same
 * backup twice is a thing people do while working out what went wrong, so a name already in use
 * gets a suffix rather than an error.
 */
async function createDatabase(
  bin: string,
  c: ReturnType<typeof connection>,
  base: string,
): Promise<string> {
  let lastError = "";
  for (let attempt = 1; attempt <= 9; attempt++) {
    const name = attempt === 1 ? base : `${base}_${attempt}`;
    const made = await run(
      tool(bin, "createdb"),
      ["-h", c.host, "-p", String(c.port), "-U", c.user, name],
      { PGPASSWORD: c.password },
    );
    if (made.code === 0) return name;
    lastError = firstLine(made.stderr) || `exit ${made.code}`;
    if (!/already exists/i.test(made.stderr)) break;
  }
  throw new Error(`Could not create the database: ${lastError}`);
}

/** jarvis_restore_20260913_0130 — the backup's own moment, so the name says which one it is. */
function nameFor(createdAt: string): string {
  const when = new Date(createdAt);
  const stamp = Number.isNaN(when.getTime()) ? new Date() : when;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    "jarvis_restore_" +
    `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}` +
    `_${pad(stamp.getHours())}${pad(stamp.getMinutes())}`
  );
}

/** Tool errors run to several lines of context; the first is the one that says what went wrong. */
function firstLine(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)[0] ?? "";
}

/** A default filename that sorts chronologically and needs no explaining. */
export function suggestedFileName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `jarvis-backup-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}.zip`
  );
}
