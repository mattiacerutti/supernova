import {join} from "node:path";
import type {BrowserWindowConstructorOptions} from "electron";
import {app, BrowserWindow, shell} from "electron";
import windowState from "electron-window-state";
import {isNightlyVersion} from "@/updates/state";

export const WINDOWS_TITLE_BAR_OVERLAY = {color: "#00000000", height: 48, symbolColor: "#FFFFFFFF"} as const;

interface CreateWindowOptions {
  readonly serverUrl: string;
  readonly rendererUrl: string;
  readonly iconsDir: string;
}

/** Creates a hidden window with persisted bounds, native chrome, and restricted navigation. The caller owns loading and closing it. */
export function createWindow({serverUrl, rendererUrl, iconsDir}: CreateWindowOptions): BrowserWindow {
  const saved = windowState({defaultWidth: 1280, defaultHeight: 800});
  let chrome: BrowserWindowConstructorOptions = {};

  if (process.platform === "win32") {
    chrome = {
      backgroundMaterial: "acrylic",
      titleBarOverlay: WINDOWS_TITLE_BAR_OVERLAY,
      titleBarStyle: "hidden",
    };
  } else if (process.platform === "darwin") {
    chrome = {
      backgroundColor: "#00000000",
      titleBarStyle: "hiddenInset",
      trafficLightPosition: {x: 20, y: 17},
      vibrancy: "under-window",
      visualEffectState: "followWindow",
    };
  }

  const window = new BrowserWindow({
    x: saved.x,
    y: saved.y,
    width: saved.width,
    height: saved.height,
    minWidth: 840,
    minHeight: 620,
    title: app.getName(),
    show: false,
    autoHideMenuBar: true,
    icon: join(iconsDir, process.platform === "win32" ? "icon.ico" : "icon.png"),
    ...chrome,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      additionalArguments: [
        `--supernova-server-url=${serverUrl}`,
        `--supernova-app-version=${app.getVersion()}`,
        ...(isNightlyVersion(app.getVersion()) ? ["--supernova-nightly"] : []),
      ],
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  saved.manage(window);
  window.once("ready-to-show", () => window.show());

  window.webContents.setWindowOpenHandler(({url}) => {
    if (["https:", "http:"].includes(new URL(url).protocol)) void shell.openExternal(url);
    return {action: "deny"};
  });

  window.webContents.on("will-navigate", (event, url) => {
    const target = new URL(url);
    const renderer = new URL(rendererUrl);
    if (target.protocol !== renderer.protocol || target.host !== renderer.host) event.preventDefault();
  });

  return window;
}
