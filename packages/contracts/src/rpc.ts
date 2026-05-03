import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import {Schema} from "effect";
import {AgentProjectsListError, AgentProjectsListResult} from "@pi-desktop/contracts/agent";

export {AgentChatSummary, AgentProjectSummary, AgentProjectsListError, AgentProjectsListResult} from "@pi-desktop/contracts/agent";
export type {
  AgentChatSummary as IAgentChatSummary,
  AgentProjectSummary as IAgentProjectSummary,
  AgentProjectsListResult as IAgentProjectsListResult,
} from "@pi-desktop/contracts/agent";

export const AGENT_RPC_METHODS = {
  projectsList: "agent.projects.list",
} as const;

export const AgentProjectsListRpc = Rpc.make(AGENT_RPC_METHODS.projectsList, {
  error: AgentProjectsListError,
  payload: Schema.Struct({}),
  success: AgentProjectsListResult,
});

export const AgentRpcGroup = RpcGroup.make(AgentProjectsListRpc);
