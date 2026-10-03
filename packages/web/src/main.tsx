import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import App from "@/app/app";
import AppProviders from "@/app/providers";
import {initializeAppearance} from "@/stores/settings-store";
import {appEnvironment} from "@/config/app-environment";
import {getRuntimeClient} from "@/rpc/transport/runtime-client";
import "@/app/styles.css";

document.documentElement.dataset.appEnvironment = appEnvironment;
initializeAppearance();

const runtime = await getRuntimeClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders runtime={runtime}>
      <App />
    </AppProviders>
  </StrictMode>
);
