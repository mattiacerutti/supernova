import * as Rpc from "effect/unstable/rpc/Rpc";
import {Schema} from "effect";
import {
  AgentSessionDetails,
  AgentSessionLoadError,
  AgentModelReference,
  AgentSessionModelsListError,
  AgentSessionModelsListResult,
  AgentSessionStreamEvent,
} from "@pi-desktop/contracts/sessions";

export const AgentSessionGetRpc = Rpc.make("getSession", {
  error: AgentSessionLoadError,
  payload: Schema.Struct({
    sessionId: Schema.String,
  }),
  success: AgentSessionDetails,
});

export const AgentSessionModelsListRpc = Rpc.make("listSessionModels", {
  error: AgentSessionModelsListError,
  payload: Schema.Void,
  success: AgentSessionModelsListResult,
});

export const AgentSessionMessageSendRpc = Rpc.make("sendSessionMessage", {
  payload: Schema.Struct({
    message: Schema.String,
    model: AgentModelReference,
    sessionId: Schema.String,
  }),
  stream: true,
  success: AgentSessionStreamEvent,
});

export const AgentSessionRpcs = [AgentSessionGetRpc, AgentSessionModelsListRpc, AgentSessionMessageSendRpc] as const;
