import {useContext} from "react";
import {AgentRpcClientContext} from "@/rpc/agent-rpc-client-context";
import type {IAgentRpcClient} from "@/rpc/agent-rpc-client";

export function useAgentRpcClient(): IAgentRpcClient {
  const client = useContext(AgentRpcClientContext);
  if (!client) throw new Error("Agent RPC client is not available.");
  return client;
}
