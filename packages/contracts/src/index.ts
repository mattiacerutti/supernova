import * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import {FolderRpcs} from "@pi-desktop/contracts/folders/rpc";
import {ProjectRpcs} from "@pi-desktop/contracts/projects/rpc";
import {ProviderRpcs} from "@pi-desktop/contracts/providers/rpc";
import {SessionRpcs} from "@pi-desktop/contracts/sessions/rpc";

export * from "@pi-desktop/contracts/folders/rpc";
export * from "@pi-desktop/contracts/projects/rpc";
export * from "@pi-desktop/contracts/providers/rpc";
export * from "@pi-desktop/contracts/sessions/rpc";

export const AgentRpcGroup = RpcGroup.make(...FolderRpcs, ...ProjectRpcs, ...ProviderRpcs, ...SessionRpcs);
