import {spawn, spawnSync} from "node:child_process";
import type {ChildProcessWithoutNullStreams} from "node:child_process";
import {homedir} from "node:os";
import {delimiter, join} from "node:path";
import type {BrowserWindowConstructorOptions} from "electron";
import {app, shell, BrowserWindow, ipcMain, nativeImage} from "electron";
import {electronApp, optimizer} from "@electron-toolkit/utils";
import installExtension, {REACT_DEVELOPER_TOOLS} from "electron-devtools-installer";
import windowState from "electron-window-state";

declare const SUPERNOVA_IS_DEV: boolean;
declare const SUPERNOVA_SERVER_ENTRY: string;

let mainWindow: BrowserWindow | undefined;
let server: SpawnedServer | undefined;

const DEV_WEB_URL = "http://localhost:5173";
const PROD_DESKTOP_SERVER_PORT = 4318;
const USER_DATA_DIR_NAME = SUPERNOVA_IS_DEV ? "supernova-dev" : "supernova";

interface SpawnedServer {
  process: ChildProcessWithoutNullStreams;
  url: string;
}

function registerDesktopIpc(): void {
  ipcMain.handle("desktop:get-server-url", () => server?.url);
  ipcMain.handle("desktop:open-in-finder", async (_, projectPath: unknown) => {
    if (typeof projectPath !== "string" || projectPath.trim().length === 0) {
      throw new Error("Project path is required to open Finder.");
    }

    const errorMessage = await shell.openPath(projectPath);
    if (errorMessage) {
      throw new Error(errorMessage);
    }
  });
}

async function createWindow(): Promise<void> {
  if (!SUPERNOVA_IS_DEV) {
    server ??= await startServerProcess({
      host: "localhost",
      port: PROD_DESKTOP_SERVER_PORT,
    });
  }

  const savedWindowState = windowState({
    defaultWidth: 1280,
    defaultHeight: 800,
  });

  mainWindow = new BrowserWindow({
    x: savedWindowState.x,
    y: savedWindowState.y,
    width: savedWindowState.width,
    height: savedWindowState.height,
    minWidth: 840,
    minHeight: 620,
    title: "Supernova",
    show: false,
    autoHideMenuBar: true,
    icon: iconPath(),
    ...windowChromeOptions(),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  savedWindowState.manage(mainWindow);

  if (SUPERNOVA_IS_DEV) {
    mainWindow.webContents.openDevTools({mode: "detach"});
  }

  if (process.platform === "darwin") {
    mainWindow.setBackgroundColor("#00000000");
  }

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return {action: "deny"};
  });

  mainWindow.loadURL(resolveRendererUrl());
}

async function installDevToolsExtensions(): Promise<void> {
  if (!SUPERNOVA_IS_DEV) return;

  try {
    await installExtension(REACT_DEVELOPER_TOOLS);
  } catch (error) {
    console.warn("Failed to install React DevTools extension.", error);
  }
}

function resolveRendererUrl(): string {
  if (SUPERNOVA_IS_DEV) return DEV_WEB_URL;
  if (!server) throw new Error("Supernova server is not available.");
  return server.url;
}

function windowChromeOptions(): Pick<
  BrowserWindowConstructorOptions,
  "backgroundColor" | "titleBarStyle" | "trafficLightPosition" | "transparent" | "vibrancy" | "visualEffectState"
> {
  if (process.platform !== "darwin") {
    return {};
  }

  return {
    backgroundColor: "#00000000",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: {x: 20, y: 17},
    transparent: true,
    vibrancy: "fullscreen-ui",
    visualEffectState: "active",
  };
}

function iconsDir(): string {
  return app.isPackaged ? join(process.resourcesPath, "icons") : join(__dirname, "../../resources/icons");
}

function iconPath(): string {
  return join(iconsDir(), "icon.png");
}

// Keep Chromium profile state, localStorage, cookies, and DevTools state isolated
// between desktop development and packaged app runs.
function resolveUserDataPath(): string {
  if (process.platform === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), USER_DATA_DIR_NAME);
  }

  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", USER_DATA_DIR_NAME);
  }

  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), USER_DATA_DIR_NAME);
}

function setDockIcon(): void {
  if (process.platform !== "darwin") return;

  const icon = nativeImage.createFromPath(join(iconsDir(), "dock.png"));
  if (!icon.isEmpty()) app.dock?.setIcon(icon);
}

function startServerProcess(options: {host: string; port: number}): Promise<SpawnedServer> {
  const args = [resolveServerEntry()];

  const child = spawn(resolveServerCommand(), args, {
    env: {
      ...process.env,
      SUPERNOVA_SERVER_HOST: options.host,
      SUPERNOVA_SERVER_PORT: String(options.port),
      SUPERNOVA_SERVER_DEV: "0",
      ...(app.isPackaged ? {ELECTRON_RUN_AS_NODE: "1"} : {}),
    },
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let stderr = "";
    const timeout = setTimeout(() => {
      settled = true;
      child.kill();
      reject(new Error("Timed out waiting for Supernova server to start"));
    }, 10_000);

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const details = stderr.trim() ? `\n${stderr.trim()}` : "";
      reject(new Error(`Supernova server exited before startup (code=${code ?? "null"}, signal=${signal ?? "null"})${details}`));
    });

    child.stdout.on("data", (chunk: Buffer) => {
      const output = chunk.toString("utf8");
      process.stdout.write(output);
      const match = output.match(/^SUPERNOVA_SERVER_URL=(.+)$/m);
      const url = match?.[1];
      if (!url) return;

      settled = true;
      clearTimeout(timeout);
      resolve({process: child, url});
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      process.stderr.write(chunk);
    });
  });
}

function syncShellEnvironment(): void {
  if (process.platform === "win32") return;

  const shellPath = process.env.SHELL;
  if (!shellPath) return;

  try {
    const result = spawnSync(shellPath, ["-ilc", `printf '\n%s\n' "$PATH"`], {
      encoding: "utf8",
      env: {
        HOME: process.env.HOME ?? homedir(),
        TERM: "dumb",
      },
      timeout: 3000,
      windowsHide: true,
    });

    if (result.status !== 0 || !result.stdout) return;

    const loginPath = result.stdout.trim().split(/\r?\n/).at(-1)?.trim();
    if (!loginPath) return;

    const mergedPathEntries = new Set(loginPath.split(delimiter).filter(Boolean));
    for (const entry of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
      mergedPathEntries.add(entry);
    }

    process.env.PATH = [...mergedPathEntries].join(delimiter);
  } catch {
    // Best effort: keep Electron's inherited environment if shell probing fails.
  }
}

function failStartup(error: unknown): void {
  console.error("Failed to start Supernova.", error);
  app.exit(1);
}

function focusMainWindow(): void {
  if (!mainWindow) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

function resolveServerCommand(): string {
  return app.isPackaged ? process.execPath : "node";
}

function resolveServerEntry(): string {
  return app.isPackaged ? join(process.resourcesPath, "server", "bootstrap.js") : SUPERNOVA_SERVER_ENTRY;
}

app.setPath("userData", resolveUserDataPath());

const hasSingleInstanceLock = SUPERNOVA_IS_DEV || app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  syncShellEnvironment();

  if (!SUPERNOVA_IS_DEV) {
    app.on("second-instance", focusMainWindow);
  }

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  app.whenReady().then(() => {
    app.setName("Supernova");
    electronApp.setAppUserModelId("dev.supernova.app");
    setDockIcon();

    app.on("browser-window-created", (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    registerDesktopIpc();

    void installDevToolsExtensions().then(createWindow).catch(failStartup);

    app.on("activate", function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) void createWindow().catch(failStartup);
    });
  });

  app.on("before-quit", () => {
    server?.process.kill();
  });

  // Quit when all windows are closed, except on macOS. There, it's common
  // for applications and their menu bar to stay active until the user quits
  // explicitly with Cmd + Q.
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
