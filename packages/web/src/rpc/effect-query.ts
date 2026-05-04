import {AgentRpcGroup} from "@pi-desktop/contracts";
import {createEffectQuery} from "effect-query";
import {Context, Layer} from "effect";
import {RpcClient} from "effect/unstable/rpc";
import {createAgentRpcProtocolLayer} from "@/rpc/agent-rpc-client";

const makeAgentRpcProtocolClient = RpcClient.make(AgentRpcGroup);
type AgentRpcClientFactory = typeof makeAgentRpcProtocolClient;
export type AgentRpcProtocolClient = AgentRpcClientFactory extends import("effect").Effect.Effect<infer Client, unknown, unknown> ? Client : never;

export class AgentRpcProtocolClientService extends Context.Service<AgentRpcProtocolClientService, AgentRpcProtocolClient>()("pi-desktop/web/AgentRpcProtocolClientService") {}

const AgentRpcProtocolClientLive = Layer.effect(AgentRpcProtocolClientService)(makeAgentRpcProtocolClient).pipe(Layer.provide(createAgentRpcProtocolLayer()));

export const eq = createEffectQuery(AgentRpcProtocolClientLive);
