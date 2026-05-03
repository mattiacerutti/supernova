import {contextBridge, ipcRenderer} from "electron";

const desktopShell = {
  getServerUrl: () => ipcRenderer.invoke("desktop:get-server-url"),
  integratedTitleBar: process.platform === "darwin",
  platform: process.platform,
};

declare global {
  interface Window {
    desktopShell: typeof desktopShell;
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("desktopShell", desktopShell);
  } catch (error) {
    console.error(error);
  }
} else {
  window.desktopShell = desktopShell;
}
