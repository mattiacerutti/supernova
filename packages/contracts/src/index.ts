import * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import {AgentFolderRpcs} from "@pi-desktop/contracts/folders/rpc";
import {AgentProjectRpcs} from "@pi-desktop/contracts/projects/rpc";
import {AgentProviderRpcs} from "@pi-desktop/contracts/providers/rpc";
import {AgentSessionRpcs} from "@pi-desktop/contracts/sessions/rpc";

export * from "@pi-desktop/contracts/folders/rpc";
export * from "@pi-desktop/contracts/projects/rpc";
export * from "@pi-desktop/contracts/providers/rpc";
export * from "@pi-desktop/contracts/sessions/rpc";

export const AgentRpcGroup = RpcGroup.make(...AgentFolderRpcs, ...AgentProjectRpcs, ...AgentProviderRpcs, ...AgentSessionRpcs);
