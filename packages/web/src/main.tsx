import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import App from "@/app/app";
import AppProviders from "@/app/providers";
import {initializeAppearance} from "@/stores/settings-store";
import {appEnvironment} from "@/config/app-environment";
import {getRpcClient} from "@/rpc/transport/client";
import "@/app/styles.css";

document.documentElement.dataset.appEnvironment = appEnvironment;
initializeAppearance();

const rpcClient = await getRpcClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders rpcClient={rpcClient}>
      <App />
    </AppProviders>
  </StrictMode>
);
