import {getSharedAgentRpcClient} from "@/rpc/agent-rpc-client";
import {AgentRpcClientContext} from "@/rpc/agent-rpc-client-context";

const client = getSharedAgentRpcClient();

interface AgentRpcClientProviderProps {
  children: React.ReactNode;
}

export default function AgentRpcClientProvider(props: AgentRpcClientProviderProps) {
  const {children} = props;

  return <AgentRpcClientContext value={client}>{children}</AgentRpcClientContext>;
}
