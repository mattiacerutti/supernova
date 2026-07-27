import {contextBridge, ipcRenderer} from "electron";

const desktopShell = {
  getServerUrl: () => ipcRenderer.invoke("desktop:get-server-url"),
  integratedTitleBar: process.platform === "darwin",
  openInFinder: (projectPath: string) => ipcRenderer.invoke("desktop:open-in-finder", projectPath),
  platform: process.platform,
  setTheme: (theme: "dark" | "light" | "system") => ipcRenderer.invoke("desktop:set-theme", theme),
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
