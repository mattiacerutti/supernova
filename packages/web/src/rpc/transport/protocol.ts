import {AgentRpcGroup} from "@supernova/contracts";
import type {Effect, Exit} from "effect";
import {Context} from "effect";
import {RpcClient as EffectRpcClient} from "effect/unstable/rpc";

/** Creates the typed protocol client used by both transports and client adapters. */
export const makeRpcProtocolClient = EffectRpcClient.make(AgentRpcGroup);

export type RpcProtocolClient = typeof makeRpcProtocolClient extends Effect.Effect<infer Client, unknown, unknown> ? Client : never;
export type RpcExecute<TSuccess, TError> = (client: RpcProtocolClient) => Effect.Effect<TSuccess, TError, never>;
export type RpcRunOptions = {readonly signal?: AbortSignal | undefined};

/** Effect service containing the active typed RPC protocol client. */
export class RpcProtocolClientService extends Context.Service<RpcProtocolClientService, RpcProtocolClient>()("supernova/web/RpcProtocolClientService") {}

/** Browser-facing adapter around the typed RPC protocol. */
export interface RpcClient {
  readonly fork: <TSuccess, TError>(execute: RpcExecute<TSuccess, TError>) => Promise<RpcClientFiber>;
  readonly run: <TSuccess, TError>(execute: RpcExecute<TSuccess, TError>) => Promise<TSuccess>;
  readonly runExit: <TSuccess, TError>(execute: RpcExecute<TSuccess, TError>, options?: RpcRunOptions) => Promise<Exit.Exit<TSuccess, TError>>;
  readonly dispose: () => Promise<void>;
}

/** Handle for a long-running RPC effect owned by the browser client. */
export interface RpcClientFiber {
  readonly completed: Promise<void>;
  readonly interrupt: () => Promise<void>;
}
