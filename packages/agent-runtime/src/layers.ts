import {Layer} from "effect";
import {LocalFoldersLive} from "@pi-desktop/agent-runtime/providers/local/folders/local-folders-live";
import {PiProvidersLive} from "@pi-desktop/agent-runtime/providers/pi/providers/pi-providers-live";
import {PiProviderSdkLive} from "@pi-desktop/agent-runtime/providers/pi/providers/pi-provider-sdk";
import {PiProjectsLive} from "@pi-desktop/agent-runtime/providers/pi/projects/pi-projects-live";
import {PiSessionsLive} from "@pi-desktop/agent-runtime/providers/pi/sessions/pi-sessions-live";
import {PiSessionSdkLive} from "@pi-desktop/agent-runtime/providers/pi/sessions/pi-session-sdk";

const PiSdkLive = Layer.mergeAll(PiProviderSdkLive, PiSessionSdkLive);

export const AgentRuntimeServicesLive = Layer.mergeAll(LocalFoldersLive, PiProjectsLive, PiProvidersLive, PiSessionsLive).pipe(Layer.provide(PiSdkLive));
