import {spawn} from "node:child_process";
import type {ChildProcessWithoutNullStreams} from "node:child_process";
import type {BrowserWindowConstructorOptions} from "electron";
import {app, shell, BrowserWindow, ipcMain} from "electron";
import {join} from "path";
import {electronApp, optimizer} from "@electron-toolkit/utils";

declare const PI_DESKTOP_IS_DEV: boolean;
declare const PI_DESKTOP_SERVER_ENTRY: string;

let mainWindow: BrowserWindow | undefined;
let server: SpawnedServer | undefined;

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
    ...windowChromeOptions(),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

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

  mainWindow.loadURL(server.url);
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
    trafficLightPosition: {x: 24, y: 25},
    transparent: true,
    vibrancy: "fullscreen-ui",
    visualEffectState: "active",
  };
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
  if (PI_DESKTOP_IS_DEV) return "bun";
  return app.isPackaged ? process.execPath : "node";
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

  registerDesktopIpc();

  void createWindow().catch(failStartup);

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
