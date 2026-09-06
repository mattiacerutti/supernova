import {join} from "node:path";
import {pathToFileURL} from "node:url";
import type {BrowserWindow} from "electron";
import {app, shell, dialog, ipcMain, nativeImage, nativeTheme, net, protocol} from "electron";
import {electronApp, optimizer} from "@electron-toolkit/utils";
import installExtension, {REACT_DEVELOPER_TOOLS} from "electron-devtools-installer";
import {startServerProcess} from "@supernova/server/process";
import type {ServerProcess} from "@supernova/server/process";
import {DESKTOP_IPC_CHANNELS} from "@/ipc";
import {resolveRendererFile} from "@/protocol";
import {syncShellEnvironment} from "@/shell";
import {createWindow, WINDOWS_TITLE_BAR_OVERLAY} from "@/window";

declare const SUPERNOVA_IS_DEV: boolean;
declare const SUPERNOVA_SERVER_ENTRY: string;
declare const SUPERNOVA_WEB_DIR: string;

const APP_URL = "supernova://app";
const ICONS_DIR = app.isPackaged ? join(process.resourcesPath, "icons") : join(__dirname, "../../resources/icons");

let mainWindow: BrowserWindow | undefined;
let server: ServerProcess | undefined;
let serverUrl: string;
let quitting = false;

function registerDesktopIpc(): void {
  ipcMain.handle(DESKTOP_IPC_CHANNELS.setNativeTheme, (_, theme: unknown) => {
    if (theme !== "dark" && theme !== "light" && theme !== "system") return;

    nativeTheme.themeSource = theme;
    if (process.platform === "win32") mainWindow?.setTitleBarOverlay(WINDOWS_TITLE_BAR_OVERLAY);
  });

  ipcMain.handle(DESKTOP_IPC_CHANNELS.openDirectory, async (_, path: unknown) => {
    if (typeof path !== "string" || !path.trim()) throw new Error("A directory path is required.");

    const error = await shell.openPath(path);
    if (error) throw new Error(error);
  });
}

/** Keeps a single window alive and propagates renderer startup failures to the app lifecycle. */
async function openWindow(): Promise<void> {
  if (mainWindow || quitting) return;

  const rendererUrl = SUPERNOVA_IS_DEV ? process.env.SUPERNOVA_WEB_URL : APP_URL;
  if (!rendererUrl) throw new Error("Start desktop development with bun run dev:desktop.");

  const window = createWindow({serverUrl, rendererUrl, iconsDir: ICONS_DIR});
  mainWindow = window;
  window.once("closed", () => {
    mainWindow = undefined;
  });

  if (SUPERNOVA_IS_DEV) window.webContents.openDevTools({mode: "detach"});
  await window.loadURL(rendererUrl);
}

function failStartup(error: unknown): void {
  console.error("Failed to start Supernova.", error);
  dialog.showErrorBox("Supernova could not start", error instanceof Error ? error.message : String(error));
  app.quit();
}

async function startDesktop(): Promise<void> {
  await app.whenReady();

  electronApp.setAppUserModelId("dev.supernova.app");
  syncShellEnvironment();

  if (SUPERNOVA_IS_DEV) {
    const endpoint = process.env.SUPERNOVA_SERVER_URL;
    if (!endpoint) throw new Error("Start desktop development with bun run dev:desktop.");

    serverUrl = endpoint;
    void installExtension(REACT_DEVELOPER_TOOLS).catch((error) => console.warn("Failed to install React DevTools.", error));
  } else {
    server = await startServerProcess({
      entry: app.isPackaged ? join(process.resourcesPath, "server/cli.js") : SUPERNOVA_SERVER_ENTRY,
      execPath: process.execPath,
      env: {ELECTRON_RUN_AS_NODE: "1", SUPERNOVA_SERVER_DEV: "0"},
    });
    serverUrl = server.url;

    void server.exited.then(() => {
      if (!quitting) failStartup(new Error("The local Supernova API stopped unexpectedly. Restart Supernova to reconnect."));
    });
  }

  if (quitting) {
    await server?.close();
    return;
  }

  const webDir = app.isPackaged ? join(process.resourcesPath, "web") : SUPERNOVA_WEB_DIR;
  protocol.handle("supernova", (request) => {
    const file = resolveRendererFile(webDir, request.url);
    return file ? net.fetch(pathToFileURL(file).href) : new Response("Not found", {status: 404});
  });

  if (process.platform === "darwin") {
    const icon = nativeImage.createFromPath(join(ICONS_DIR, "dock.png"));
    if (!icon.isEmpty()) app.dock?.setIcon(icon);
  }

  registerDesktopIpc();
  app.on("browser-window-created", (_, window) => optimizer.watchWindowShortcuts(window));

  await openWindow();
  app.on("activate", () => void openWindow().catch(failStartup));
}

app.setName("Supernova");
app.setPath("userData", join(app.getPath("appData"), SUPERNOVA_IS_DEV ? "supernova-dev" : "supernova"));
protocol.registerSchemesAsPrivileged([{scheme: "supernova", privileges: {standard: true, secure: true, supportFetchAPI: true}}]);

if (!SUPERNOVA_IS_DEV && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });

  process.on("SIGINT", () => {
    if (!quitting) app.quit();
  });
  process.on("SIGTERM", () => {
    if (!quitting) app.quit();
  });

  const startup = startDesktop();
  void startup.catch(failStartup);

  app.on("before-quit", (event) => {
    if (quitting) return;

    event.preventDefault();
    quitting = true;

    void startup
      .catch(() => undefined)
      .then(() => server?.close())
      .finally(() => app.quit());
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
