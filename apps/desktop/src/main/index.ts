import {app, shell, BrowserWindow, ipcMain} from "electron";
import {join} from "path";
import {electronApp, optimizer} from "@electron-toolkit/utils";
import serve from "electron-serve";
import {createPiRuntime} from "@pi-desktop/pi-runtime";

declare const PI_DESKTOP_WEB_DIST: string;
declare const PI_DESKTOP_IS_DEV: boolean;
declare const PI_DESKTOP_RENDERER_DEV_URL: string;

const runtime = createPiRuntime({cwd: process.cwd()});
const loadProductionWeb = serve({
  directory: app.isPackaged ? join(process.resourcesPath, "web-dist") : PI_DESKTOP_WEB_DIST,
});

let mainWindow: BrowserWindow | undefined;

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

  if (PI_DESKTOP_IS_DEV) {
    mainWindow.loadURL(PI_DESKTOP_RENDERER_DEV_URL);
  } else {
    await loadProductionWeb(mainWindow);
  }
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

  void createWindow();

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("before-quit", () => {
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
