import {createEffectQueryFromManagedRuntime} from "effect-query";
import {Effect} from "effect";
import type {ManagedRuntime} from "effect/ManagedRuntime";
import {RpcProtocolClientService, getRpcClient} from "@/rpc/transport/client";

// effect-query only needs ManagedRuntime.runPromiseExit. Route it through the shared
// reconnectable client so query hooks and imperative streams use one WebSocket.
const sharedRpcRuntime = {
  runPromiseExit: async <TSuccess, TError>(effect: Effect.Effect<TSuccess, TError, RpcProtocolClientService>, options?: {readonly signal?: AbortSignal | undefined}) => {
    const rpcClient = await getRpcClient();
    return rpcClient.runExit((client) => Effect.provideService(effect, RpcProtocolClientService, client), options);
  },
} as ManagedRuntime<RpcProtocolClientService, never>;

export const eq = createEffectQueryFromManagedRuntime(sharedRpcRuntime);
