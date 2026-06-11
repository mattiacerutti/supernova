import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import App from "@/app/app";
import {getAppEnvironment} from "@/app/app-environment";
import AppProviders from "@/app/providers";
import {getAgentRpcClient} from "@/rpc/agent-rpc-client";
import "@/app/styles.css";

interface DesktopShell {
  getServerUrl: () => Promise<string | undefined>;
  integratedTitleBar: boolean;
  openInFinder: (projectPath: string) => Promise<void>;
  platform: string;
}

declare global {
  interface Window {
    desktopShell?: DesktopShell;
  }
}

const desktopShell = window.desktopShell;
const appEnvironment = getAppEnvironment(desktopShell?.platform);

document.documentElement.dataset.appEnvironment = appEnvironment;

const rpcClient = await getAgentRpcClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders rpcClient={rpcClient}>
      <App appEnvironment={appEnvironment} />
    </AppProviders>
  </StrictMode>
);
