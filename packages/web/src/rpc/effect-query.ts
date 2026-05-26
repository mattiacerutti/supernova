import {createEffectQueryFromManagedRuntime} from "effect-query";
import {Effect} from "effect";
import type {ManagedRuntime} from "effect/ManagedRuntime";
import {AgentRpcProtocolClientService, getSharedAgentRpcClient} from "@/rpc/agent-rpc-client";

// effect-query only needs ManagedRuntime.runPromiseExit. Route it through the shared
// reconnectable client so query hooks and imperative streams use one WebSocket.
const sharedRpcRuntime = {
  runPromiseExit: <TSuccess, TError>(effect: Effect.Effect<TSuccess, TError, AgentRpcProtocolClientService>, options?: {readonly signal?: AbortSignal | undefined}) =>
    getSharedAgentRpcClient().runExit((client) => Effect.provideService(effect, AgentRpcProtocolClientService, client), options),
} as ManagedRuntime<AgentRpcProtocolClientService, never>;

export const eq = createEffectQueryFromManagedRuntime(sharedRpcRuntime);
