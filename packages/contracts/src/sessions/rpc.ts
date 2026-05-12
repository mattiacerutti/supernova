import * as Rpc from "effect/unstable/rpc/Rpc";
import {
  AgentSessionCreateError,
  AgentSessionCreatePayload,
  AgentSessionCreateResult,
  AgentSessionGetPayload,
  AgentSessionGetResult,
  AgentSessionLoadError,
  AgentSessionMessageSendPayload,
  AgentSessionModelsListError,
  AgentSessionModelsListPayload,
  AgentSessionModelsListResult,
  AgentSessionStreamEvent,
} from "@pi-desktop/contracts/sessions/procedures";

export const AgentSessionGetRpc = Rpc.make("getSession", {
  error: AgentSessionLoadError,
  payload: AgentSessionGetPayload,
  success: AgentSessionGetResult,
});

export const AgentSessionCreateRpc = Rpc.make("createSession", {
  error: AgentSessionCreateError,
  payload: AgentSessionCreatePayload,
  success: AgentSessionCreateResult,
});

export const AgentSessionModelsListRpc = Rpc.make("listSessionModels", {
  error: AgentSessionModelsListError,
  payload: AgentSessionModelsListPayload,
  success: AgentSessionModelsListResult,
});

export const AgentSessionMessageSendRpc = Rpc.make("sendSessionMessage", {
  payload: AgentSessionMessageSendPayload,
  stream: true,
  success: AgentSessionStreamEvent,
});

export const AgentSessionRpcs = [AgentSessionGetRpc, AgentSessionCreateRpc, AgentSessionModelsListRpc, AgentSessionMessageSendRpc] as const;
