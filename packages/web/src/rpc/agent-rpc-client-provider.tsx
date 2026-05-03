import {useState} from "react";
import {createAgentRpcClient} from "@/rpc/agent-rpc-client";
import {AgentRpcClientContext} from "@/rpc/agent-rpc-client-context";

const client = createAgentRpcClient();

interface IAgentRpcClientProviderProps {
  children: React.ReactNode;
}

export default function AgentRpcClientProvider(props: IAgentRpcClientProviderProps) {
  const {children} = props;
  const [rpcClient] = useState(() => client);

  return <AgentRpcClientContext value={rpcClient}>{children}</AgentRpcClientContext>;
}
