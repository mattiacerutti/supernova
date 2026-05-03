import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import App from "@/app/app.tsx";
import "@/app/styles.css";

interface IPiDesktopShell {
  integratedTitleBar: boolean;
  platform: string;
}

declare global {
  interface Window {
    piDesktopShell?: IPiDesktopShell;
  }
}

const desktopShell = window.piDesktopShell;

if (desktopShell?.integratedTitleBar) {
  document.documentElement.dataset.desktopShell = "integrated-titlebar";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App integratedTitleBar={desktopShell?.integratedTitleBar === true} />
  </StrictMode>
);
