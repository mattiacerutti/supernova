import {contextBridge, ipcRenderer} from "electron";

const pi = {
  init: () => ipcRenderer.invoke("pi:init"),
  getState: () => ipcRenderer.invoke("pi:get-state"),
  prompt: (message: string) => ipcRenderer.invoke("pi:prompt", message),
  abort: () => ipcRenderer.invoke("pi:abort"),
  onEvent: (listener: (event: unknown) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, payload: unknown): void => listener(payload);
    ipcRenderer.on("pi:event", subscription);
    return () => ipcRenderer.removeListener("pi:event", subscription);
  },
};

declare global {
  interface Window {
    pi: typeof pi;
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("pi", pi);
  } catch (error) {
    console.error(error);
  }
} else {
  window.pi = pi;
}
