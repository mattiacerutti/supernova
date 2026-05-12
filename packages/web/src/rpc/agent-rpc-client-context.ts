import {createContext} from "react";
import type {AgentRpcClientApi} from "@/rpc/agent-rpc-client";

export const AgentRpcClientContext = createContext<AgentRpcClientApi | null>(null);
