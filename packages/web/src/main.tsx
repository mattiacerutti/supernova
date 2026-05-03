import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import App from "@/app/app";
import AppProviders from "@/app/providers";
import "@/app/styles.css";

interface IDesktopShell {
  integratedTitleBar: boolean;
  platform: string;
}

declare global {
  interface Window {
    desktopShell?: IDesktopShell;
  }
}

const desktopShell = window.desktopShell;

if (desktopShell?.integratedTitleBar) {
  document.documentElement.dataset.desktopShell = "integrated-titlebar";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <App integratedTitleBar={desktopShell?.integratedTitleBar === true} />
    </AppProviders>
  </StrictMode>
);
