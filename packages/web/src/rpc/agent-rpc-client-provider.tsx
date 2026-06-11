import type {AgentRpcClientApi} from "@/rpc/agent-rpc-client";
import {AgentRpcClientContext} from "@/rpc/agent-rpc-client-context";

interface AgentRpcClientProviderProps {
  readonly children: React.ReactNode;
  readonly client: AgentRpcClientApi;
}

export default function AgentRpcClientProvider(props: AgentRpcClientProviderProps) {
  const {children, client} = props;

  return <AgentRpcClientContext value={client}>{children}</AgentRpcClientContext>;
}
