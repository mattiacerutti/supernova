import {AgentRpcGroup} from "@supernova/contracts";
import type {Effect, Exit} from "effect";
import {Context} from "effect";
import {RpcClient} from "effect/unstable/rpc";

/** Creates the typed protocol client used by both transports and client adapters. */
export const makeAgentRpcProtocolClient = RpcClient.make(AgentRpcGroup);

export type AgentRpcProtocolClient = typeof makeAgentRpcProtocolClient extends Effect.Effect<infer Client, unknown, unknown> ? Client : never;
export type AgentRpcExecute<TSuccess, TError> = (client: AgentRpcProtocolClient) => Effect.Effect<TSuccess, TError, never>;
export type AgentRpcRunOptions = {readonly signal?: AbortSignal | undefined};

/** Effect service containing the active typed RPC protocol client. */
export class AgentRpcProtocolClientService extends Context.Service<AgentRpcProtocolClientService, AgentRpcProtocolClient>()("supernova/web/AgentRpcProtocolClientService") {}

/** Browser-facing adapter around the typed RPC protocol. */
export interface AgentRpcClientApi {
  readonly fork: <TSuccess, TError>(execute: AgentRpcExecute<TSuccess, TError>) => Promise<AgentRpcClientFiber>;
  readonly run: <TSuccess, TError>(execute: AgentRpcExecute<TSuccess, TError>) => Promise<TSuccess>;
  readonly runExit: <TSuccess, TError>(execute: AgentRpcExecute<TSuccess, TError>, options?: AgentRpcRunOptions) => Promise<Exit.Exit<TSuccess, TError>>;
  readonly dispose: () => Promise<void>;
}

/** Handle for a long-running RPC effect owned by the browser client. */
export interface AgentRpcClientFiber {
  readonly completed: Promise<void>;
  readonly interrupt: () => Promise<void>;
}
