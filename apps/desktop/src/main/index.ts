import {spawn} from "node:child_process";
import type {ChildProcessWithoutNullStreams} from "node:child_process";
import {app, shell, BrowserWindow, ipcMain} from "electron";
import {join} from "path";
import {electronApp, optimizer} from "@electron-toolkit/utils";
import {createPiRuntime} from "@pi-desktop/pi-runtime";

declare const PI_DESKTOP_IS_DEV: boolean;
declare const PI_DESKTOP_SERVER_ENTRY: string;

const runtime = createPiRuntime({cwd: process.cwd()});

let mainWindow: BrowserWindow | undefined;
let server: SpawnedServer | undefined;

interface SpawnedServer {
  process: ChildProcessWithoutNullStreams;
  url: string;
}

runtime.onEvent((event) => {
  mainWindow?.webContents.send("pi:event", event);
});

function registerPiIpc(): void {
  ipcMain.handle("pi:init", () => runtime.init());
  ipcMain.handle("pi:get-state", () => runtime.getState());
  ipcMain.handle("pi:prompt", (_event, message: string) => runtime.prompt(message));
  ipcMain.handle("pi:abort", () => runtime.abort());
}

async function createWindow(): Promise<void> {
  server ??= await startServerProcess({
    host: "127.0.0.1",
    isDev: PI_DESKTOP_IS_DEV,
    port: 0,
  });

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

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

  mainWindow.loadURL(server.url);
}

function startServerProcess(options: {host: string; isDev: boolean; port: number}): Promise<SpawnedServer> {
  const args = [resolveServerEntry()];

  const child = spawn(resolveServerCommand(), args, {
    env: {
      ...process.env,
      PI_DESKTOP_SERVER_HOST: options.host,
      PI_DESKTOP_SERVER_PORT: String(options.port),
      PI_DESKTOP_SERVER_DEV: options.isDev ? "1" : "0",
      ...(app.isPackaged ? {ELECTRON_RUN_AS_NODE: "1"} : {}),
    },
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let stderr = "";
    const timeout = setTimeout(() => {
      settled = true;
      child.kill();
      reject(new Error("Timed out waiting for Pi Desktop server to start"));
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
      reject(new Error(`Pi Desktop server exited before startup (code=${code ?? "null"}, signal=${signal ?? "null"})${details}`));
    });

    child.stdout.on("data", (chunk: Buffer) => {
      const output = chunk.toString("utf8");
      process.stdout.write(output);
      const match = output.match(/^PI_DESKTOP_SERVER_URL=(.+)$/m);
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

function failStartup(error: unknown): void {
  console.error("Failed to start Pi Desktop.", error);
  app.exit(1);
}

function resolveServerCommand(): string {
  return app.isPackaged ? process.execPath : "bun";
}

function resolveServerEntry(): string {
  return app.isPackaged ? join(process.resourcesPath, "server", "bootstrap.js") : PI_DESKTOP_SERVER_ENTRY;
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  electronApp.setAppUserModelId("dev.pi-desktop.app");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerPiIpc();

  void createWindow().catch(failStartup);

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) void createWindow().catch(failStartup);
  });
});

app.on("before-quit", () => {
  server?.process.kill();
  runtime.dispose();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
