import { app, BrowserWindow, Menu, Tray, ipcMain, shell, dialog, nativeImage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Supervisor } from "./supervisor.js";
import { readHealth } from "./health.js";
import { repoRoot, repoRootIsValid, writeSettings, readSettings, loadStack } from "./config.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const supervisor = new Supervisor();
let window: BrowserWindow | null = null;
let tray: Tray | null = null;
/** Set only on a real quit, so the close button can mean "hide" without trapping the app open. */
let quitting = false;
let minimiseToTray = true;

/** One window, always. A second launch raises the one already open instead of starting a rival. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => reveal());
}

function iconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.ico")
    : path.join(dirname, "..", "build", "icon.ico");
}

function reveal(): void {
  if (!window) return createWindow();
  if (!window.isVisible()) window.show();
  if (window.isMinimized()) window.restore();
  window.focus();
}

function createWindow(): void {
  window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: "#0b1020",
    autoHideMenuBar: true,
    icon: iconPath(),
    webPreferences: {
      preload: path.join(dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.once("ready-to-show", () => window?.show());

  // The close button hides rather than quits, so the stack keeps running in the tray. The minimise
  // button is left alone and does the ordinary thing. Quit is deliberate: the tray menu, or the
  // Settings toggle turned off.
  window.on("close", (e) => {
    if (quitting || !minimiseToTray) return;
    e.preventDefault();
    window?.hide();
  });

  window.on("closed", () => {
    window = null;
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(dirname, "..", "dist", "index.html"));
  }
}

function createTray(): void {
  const image = nativeImage.createFromPath(iconPath());
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip("Jarvis Control Center");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Control Center", click: () => reveal() },
      { type: "separator" },
      { label: "Start all services", click: () => void supervisor.startAll() },
      { label: "Stop all services", click: () => void supervisor.stopAll() },
      { label: "Open web app", click: () => void openWebApp() },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("double-click", () => reveal());
}

async function openWebApp(): Promise<void> {
  const port = loadStack().frontend.port;
  await shell.openExternal(`http://localhost:${port}`);
}

function notifyRenderer(): void {
  if (window && !window.isDestroyed()) window.webContents.send("jarvis:changed");
}

function registerIpc(): void {
  ipcMain.handle("jarvis:state", async () => ({
    services: await supervisor.state(),
    dependencies: await supervisor.dependencies(),
    busy: supervisor.isBusy(),
  }));
  ipcMain.handle("jarvis:logs", () => supervisor.recentLogs());
  ipcMain.handle("jarvis:health", () => readHealth(repoRoot()));
  ipcMain.handle("jarvis:settings", () => ({
    repoRoot: repoRoot(),
    repoRootValid: repoRootIsValid(),
    minimiseToTray,
    version: app.getVersion(),
    electron: process.versions.electron,
  }));

  ipcMain.handle("jarvis:start-all", () => supervisor.startAll());
  ipcMain.handle("jarvis:stop-all", () => supervisor.stopAll());
  ipcMain.handle("jarvis:restart", (_e, name: string) => supervisor.restart(name));
  ipcMain.handle("jarvis:clear-logs", () => supervisor.clearLogs());
  ipcMain.handle("jarvis:open-web-app", () => openWebApp());
  ipcMain.handle("jarvis:open-external", (_e, url: string) => shell.openExternal(url));

  ipcMain.handle("jarvis:set-minimise-to-tray", (_e, on: boolean) => {
    minimiseToTray = on;
    writeSettings({ minimiseToTray: on });
    return minimiseToTray;
  });

  ipcMain.handle("jarvis:choose-repo-root", async () => {
    const picked = await dialog.showOpenDialog({
      title: "Where is the Jarvis checkout?",
      properties: ["openDirectory"],
      defaultPath: repoRoot(),
    });
    if (picked.canceled || !picked.filePaths[0]) return { repoRoot: repoRoot(), repoRootValid: repoRootIsValid() };
    writeSettings({ repoRoot: picked.filePaths[0] });
    return { repoRoot: repoRoot(), repoRootValid: repoRootIsValid() };
  });
}

void app.whenReady().then(async () => {
  minimiseToTray = readSettings().minimiseToTray ?? true;
  registerIpc();
  createWindow();
  createTray();

  supervisor.on("state", notifyRenderer);
  supervisor.on("log", notifyRenderer);
  // Read the log files from the outset: services started by anything else still show up.
  supervisor.startTailing();

  // Asked for: opening the Control Center brings the stack up. startAll only touches what is not
  // already listening, so opening it to glance at a healthy stack leaves that stack alone.
  if (repoRootIsValid()) {
    void supervisor.startAll();
  }
});

app.on("before-quit", () => {
  quitting = true;
  supervisor.stopTailing();
  supervisor.shutdown();
});

// Closing the window is not leaving: the tray is still there and the services are still running.
app.on("window-all-closed", () => {
  if (!minimiseToTray) app.quit();
});
