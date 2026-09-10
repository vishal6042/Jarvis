import { useCallback, useEffect, useState } from "react";

export type Status = "running" | "starting" | "stopped" | "failed";

export interface ServiceState {
  name: string;
  label: string;
  description: string;
  port: number;
  status: Status;
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
  /** What it is actually doing, where an open port alone does not say. */
  detail?: string;
  /** Listening, but not able to serve -- an empty Qdrant answers every lookup with nothing. */
  degraded?: boolean;
}

export interface LogLine {
  service: string;
  text: string;
  at: number;
}

export interface Health {
  cpu: number;
  memory: number;
  disk: number;
  /** Null when there is no discrete GPU, or the driver will not say. */
  gpu: number | null;
  gpuName: string | null;
  gpuMemory: number | null;
  uptime: number;
  environment: string;
}

export interface Settings {
  repoRoot: string;
  repoRootValid: boolean;
  minimiseToTray: boolean;
  version: string;
  electron: string;
}

interface JarvisApi {
  getState(): Promise<{ services: ServiceState[]; dependencies: DependencyState[]; busy: boolean }>;
  getLogs(): Promise<LogLine[]>;
  getHealth(): Promise<Health>;
  getSettings(): Promise<Settings>;
  startAll(): Promise<void>;
  stopAll(): Promise<void>;
  restart(name: string): Promise<void>;
  clearLogs(): Promise<void>;
  openWebApp(): Promise<void>;
  openExternal(url: string): Promise<void>;
  chooseRepoRoot(): Promise<{ repoRoot: string; repoRootValid: boolean }>;
  setMinimiseToTray(on: boolean): Promise<boolean>;
  onChanged(fn: () => void): () => void;
}

declare global {
  interface Window {
    jarvis: JarvisApi;
  }
}

export const api = () => window.jarvis;

/**
 * Service state and logs, refreshed when the main process says something changed and on a slow
 * timer besides -- a service someone stopped from a terminal is not an event we would ever hear
 * about, so the ports get re-read regardless.
 */
export function useStack() {
  const [services, setServices] = useState<ServiceState[]>([]);
  const [dependencies, setDependencies] = useState<DependencyState[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const [state, lines] = await Promise.all([api().getState(), api().getLogs()]);
    setServices(state.services);
    setDependencies(state.dependencies);
    setBusy(state.busy);
    setLogs(lines);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
    const off = api().onChanged(() => void refresh());
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      off();
      clearInterval(timer);
    };
  }, [refresh]);

  return { services, dependencies, logs, busy, loaded, refresh };
}

export function useHealth(): Health | null {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    const read = () => void api().getHealth().then(setHealth);
    read();
    const timer = setInterval(read, 4000);
    return () => clearInterval(timer);
  }, []);
  return health;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const reload = useCallback(() => void api().getSettings().then(setSettings), []);
  useEffect(reload, [reload]);
  return { settings, reload };
}

export function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

export function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour12: false });
}
