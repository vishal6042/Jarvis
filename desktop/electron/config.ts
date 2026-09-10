import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export interface ServiceDef {
  n: number;
  name: string;
  label: string;
  description: string;
  port: number;
  wait: number;
}

export interface DependencyDef {
  name: string;
  label: string;
  description: string;
  port: number;
  /** Nothing in the stack can run without it, so starting is refused while it is down. */
  required: boolean;
  /**
   * What breaks while this is down, in the manifest rather than inferred from `required`: losing
   * Ollama costs every AI feature, losing Qdrant costs only the quoted guidance.
   */
  downMessage?: string;
  /**
   * How to start it, for a dependency that has no service manager of its own. Absent means "not
   * ours to start" -- which is still true of Postgres and Ollama.
   */
  start?: { command: string; args?: string[]; cwd?: string };
}

export interface StackDef {
  services: ServiceDef[];
  frontend: { name: string; label: string; description: string; port: number };
  dependencies: DependencyDef[];
}

const SETTINGS_FILE = () => path.join(app.getPath("userData"), "settings.json");

export interface Settings {
  repoRoot?: string;
  /** Close button hides to the tray instead of quitting. On by default. */
  minimiseToTray?: boolean;
}

export function readSettings(): Settings {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE(), "utf8")) as Settings;
  } catch {
    return {};
  }
}

export function writeSettings(patch: Settings): void {
  const merged = { ...readSettings(), ...patch };
  fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(merged, null, 2), "utf8");
}

/** A directory is the repo when it holds the file every launcher reads. */
function looksLikeRepo(dir: string): boolean {
  return fs.existsSync(path.join(dir, "services", "services.json"));
}

/**
 * Where the Jarvis checkout lives.
 *
 * Running from source it is simply two levels up. Installed, the app sits wherever the installer
 * put it and has no way to know, so the answer is remembered in settings and can be changed on the
 * Settings page. The walk up is still tried first: it costs nothing and it is right during
 * development, when the remembered value is most likely to be stale.
 */
export function repoRoot(): string {
  const remembered = readSettings().repoRoot;
  if (remembered && looksLikeRepo(remembered)) return remembered;

  let dir = app.isPackaged ? path.dirname(app.getPath("exe")) : app.getAppPath();
  for (let up = 0; up < 6; up++) {
    if (looksLikeRepo(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Nothing found: hand back whatever was remembered so the UI can say it is wrong, rather than
  // silently pointing somewhere that only looks plausible.
  return remembered ?? dir;
}

export function repoRootIsValid(root = repoRoot()): boolean {
  return looksLikeRepo(root);
}

export function loadStack(root = repoRoot()): StackDef {
  const raw = fs.readFileSync(path.join(root, "services", "services.json"), "utf8");
  return JSON.parse(raw) as StackDef;
}
