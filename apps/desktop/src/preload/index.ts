import type {DesktopApi, DesktopEnvironment} from "@supernova/contracts/desktop/api";
import {contextBridge, ipcRenderer} from "electron";
import {DESKTOP_IPC_CHANNELS} from "@/shared/desktop-ipc";

function resolveDesktopEnvironment(): DesktopEnvironment {
  if (process.platform === "darwin") return "mac";
  if (process.platform === "win32") return "windows";
  return "linux";
}

const desktopApi = {
  environment: resolveDesktopEnvironment(),
  openDirectory: (path) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.openDirectory, path),
  setNativeTheme: (theme) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.setNativeTheme, theme),
} satisfies DesktopApi;

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
