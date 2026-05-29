import * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import {FolderRpcs} from "@supernova/contracts/folders/rpc";
import {ProjectRpcs} from "@supernova/contracts/projects/rpc";
import {ProviderRpcs} from "@supernova/contracts/providers/rpc";
import {SessionRuntimeRpcs} from "@supernova/contracts/session-runtime/rpc";
import {SessionRpcs} from "@supernova/contracts/sessions/rpc";

export * from "@supernova/contracts/folders/rpc";
export * from "@supernova/contracts/projects/rpc";
export * from "@supernova/contracts/providers/rpc";
export * from "@supernova/contracts/session-runtime/rpc";
export * from "@supernova/contracts/sessions/rpc";

export const AgentRpcGroup = RpcGroup.make(...FolderRpcs, ...ProjectRpcs, ...ProviderRpcs, ...SessionRpcs, ...SessionRuntimeRpcs);
