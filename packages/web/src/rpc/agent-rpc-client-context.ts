import {createContext} from "react";
import type {IAgentRpcClient} from "@/rpc/agent-rpc-client";

export const AgentRpcClientContext = createContext<IAgentRpcClient | null>(null);
