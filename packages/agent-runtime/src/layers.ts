import {Layer} from "effect";
import {FileSystemFoldersLive} from "@supernova/agent-runtime/implementations/filesystem/folders/filesystem-folders-live";
import {PiSdkLive} from "@supernova/agent-runtime/implementations/pi/pi-sdk";
import {PiProvidersLive} from "@supernova/agent-runtime/implementations/pi/providers/pi-providers-live";
import {PiProjectsLive} from "@supernova/agent-runtime/implementations/pi/projects/pi-projects-live";
import {PiSessionsLive} from "@supernova/agent-runtime/implementations/pi/sessions/pi-sessions-live";

export const AgentRuntimeServicesLive = Layer.mergeAll(FileSystemFoldersLive, PiProjectsLive, PiProvidersLive, PiSessionsLive).pipe(Layer.provide(PiSdkLive));
