import {Layer} from "effect";
import {PiProjectsLive} from "@pi-desktop/agent-runtime/providers/pi/projects/pi-projects-live";

export const AgentRuntimeServicesLive = Layer.mergeAll(PiProjectsLive);
