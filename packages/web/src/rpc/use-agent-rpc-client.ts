import {use} from "react";
import {AgentRpcClientContext} from "@/rpc/agent-rpc-client-context";
import type {AgentRpcClientApi} from "@/rpc/agent-rpc-client";

export function useAgentRpcClient(): AgentRpcClientApi {
  const client = use(AgentRpcClientContext);
  if (!client) throw new Error("Agent RPC client is not available.");
  return client;
}
