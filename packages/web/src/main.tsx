import type {DesktopApi} from "@supernova/contracts/desktop/api";
import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import App from "@/app/app";
import AppProviders from "@/app/providers";
import {initializeAppearance} from "@/features/settings/stores/appearance-store";
import {getAgentRpcClient} from "@/rpc/agent-rpc-client";
import "@/app/styles.css";

declare global {
  interface Window {
    desktopApi?: DesktopApi;
  }
}

const appEnvironment = window.desktopApi?.environment ?? "web";

document.documentElement.dataset.appEnvironment = appEnvironment;
initializeAppearance();

const rpcClient = await getAgentRpcClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders rpcClient={rpcClient}>
      <App appEnvironment={appEnvironment} />
    </AppProviders>
  </StrictMode>
);
