import {Layer} from "effect";
import {PiConfigurationLive} from "@supernova/agent-runtime/layers/configuration/pi-configuration-live";
import {FileSystemFoldersLive} from "@supernova/agent-runtime/layers/folders/filesystem-folders-live";
import {PiSdkLive} from "@supernova/agent-runtime/layers/pi-sdk";
import {PiProvidersLive} from "@supernova/agent-runtime/layers/providers/pi-providers-live";
import {PiProjectsLive} from "@supernova/agent-runtime/layers/projects/pi-projects-live";
import {PiSessionRuntimeLive} from "@supernova/agent-runtime/layers/session-runtime/pi-session-runtime-live";
import {PiSessionsLive} from "@supernova/agent-runtime/layers/sessions/pi-sessions-live";

export const AgentRuntimeServicesLive = Layer.mergeAll(PiConfigurationLive, FileSystemFoldersLive, PiProjectsLive, PiProvidersLive, PiSessionRuntimeLive, PiSessionsLive).pipe(
  Layer.provide(PiSdkLive)
);
