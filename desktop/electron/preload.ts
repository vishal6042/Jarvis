import { contextBridge, ipcRenderer, webUtils } from "electron";

/**
 * The whole surface the window is allowed to touch. Node stays out of the renderer: it only ever
 * asks the main process to do something and listens for what came back.
 */
const api = {
  getState: () => ipcRenderer.invoke("jarvis:state"),
  getLogs: () => ipcRenderer.invoke("jarvis:logs"),
  getHealth: () => ipcRenderer.invoke("jarvis:health"),
  getSettings: () => ipcRenderer.invoke("jarvis:settings"),

  startAll: () => ipcRenderer.invoke("jarvis:start-all"),
  stopAll: () => ipcRenderer.invoke("jarvis:stop-all"),
  restart: (name: string) => ipcRenderer.invoke("jarvis:restart", name),
  clearLogs: () => ipcRenderer.invoke("jarvis:clear-logs"),
  openWebApp: () => ipcRenderer.invoke("jarvis:open-web-app"),
  openExternal: (url: string) => ipcRenderer.invoke("jarvis:open-external", url),
  chooseRepoRoot: () => ipcRenderer.invoke("jarvis:choose-repo-root"),
  setMinimiseToTray: (on: boolean) => ipcRenderer.invoke("jarvis:set-minimise-to-tray", on),

  getBackupInfo: () => ipcRenderer.invoke("jarvis:backup-info"),
  backup: () => ipcRenderer.invoke("jarvis:backup"),
  restore: (file?: string) => ipcRenderer.invoke("jarvis:restore", file),
  choosePgBin: () => ipcRenderer.invoke("jarvis:choose-pg-bin"),

  /**
   * The path behind a dropped file. Electron removed File.path, so the renderer cannot read it
   * itself; this is the sanctioned way to turn a drop into something the main process can open.
   */
  pathForFile: (file: File) => webUtils.getPathForFile(file),

  onChanged: (fn: () => void) => {
    const listener = () => fn();
    ipcRenderer.on("jarvis:changed", listener);
    return () => ipcRenderer.removeListener("jarvis:changed", listener);
  },

  onBackupProgress: (fn: (step: string) => void) => {
    const listener = (_e: unknown, p: { step: string }) => fn(p.step);
    ipcRenderer.on("jarvis:backup-progress", listener);
    return () => ipcRenderer.removeListener("jarvis:backup-progress", listener);
  },
};

contextBridge.exposeInMainWorld("jarvis", api);

export type JarvisApi = typeof api;
