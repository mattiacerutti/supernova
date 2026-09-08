import type {DesktopApi, DesktopUpdateState} from "@supernova/contracts/desktop/api";
import type {IpcRendererEvent} from "electron";
import {contextBridge, ipcRenderer} from "electron";
import {DESKTOP_IPC_CHANNELS} from "@/ipc";

function readArgument(prefix: string): string | undefined {
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

const desktopApi = {
  environment: process.platform === "darwin" ? "mac" : process.platform === "win32" ? "windows" : "linux",
  serverUrl: readArgument("--supernova-server-url=") ?? "",
  appVersion: readArgument("--supernova-app-version=") ?? "",
  nightly: process.argv.includes("--supernova-nightly"),

  openDirectory: (path) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.openDirectory, path),
  setNativeTheme: (theme) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.setNativeTheme, theme),

  getUpdateState: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getUpdateState),
  downloadUpdate: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.downloadUpdate),
  installUpdate: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.installUpdate),
  onUpdateState: (listener) => {
    const handler = (_: IpcRendererEvent, state: DesktopUpdateState): void => listener(state);
    ipcRenderer.on(DESKTOP_IPC_CHANNELS.updateState, handler);
    return () => ipcRenderer.removeListener(DESKTOP_IPC_CHANNELS.updateState, handler);
  },
} satisfies DesktopApi;

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
