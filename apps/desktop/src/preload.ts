import type {DesktopApi} from "@supernova/contracts/desktop/api";
import {contextBridge, ipcRenderer} from "electron";
import {DESKTOP_IPC_CHANNELS} from "@/ipc";

const serverUrlPrefix = "--supernova-server-url=";
const serverUrlArgument = process.argv.find((argument) => argument.startsWith(serverUrlPrefix));

const desktopApi = {
  environment: process.platform === "darwin" ? "mac" : process.platform === "win32" ? "windows" : "linux",
  serverUrl: serverUrlArgument?.slice(serverUrlPrefix.length) ?? "",

  openDirectory: (path) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.openDirectory, path),
  setNativeTheme: (theme) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.setNativeTheme, theme),
} satisfies DesktopApi;

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
