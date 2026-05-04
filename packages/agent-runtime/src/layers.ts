import {Layer} from "effect";
import {LocalFoldersLive} from "@pi-desktop/agent-runtime/providers/local/folders/local-folders-live";
import {PiProjectsLive} from "@pi-desktop/agent-runtime/providers/pi/projects/pi-projects-live";

export const AgentRuntimeServicesLive = Layer.mergeAll(LocalFoldersLive, PiProjectsLive);
