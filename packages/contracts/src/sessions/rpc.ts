import * as Rpc from "effect/unstable/rpc/Rpc";
import {
  SessionCreateError,
  SessionCreatePayload,
  SessionCreateResult,
  SessionGetPayload,
  SessionGetResult,
  SessionLoadError,
  SessionMessageSendPayload,
  SessionModelsListError,
  SessionModelsListPayload,
  SessionModelsListResult,
  SessionStreamEvent,
} from "@pi-desktop/contracts/sessions/procedures";

export const SessionGetRpc = Rpc.make("getSession", {
  error: SessionLoadError,
  payload: SessionGetPayload,
  success: SessionGetResult,
});

export const SessionCreateRpc = Rpc.make("createSession", {
  error: SessionCreateError,
  payload: SessionCreatePayload,
  success: SessionCreateResult,
});

export const SessionModelsListRpc = Rpc.make("listSessionModels", {
  error: SessionModelsListError,
  payload: SessionModelsListPayload,
  success: SessionModelsListResult,
});

export const SessionMessageSendRpc = Rpc.make("sendSessionMessage", {
  payload: SessionMessageSendPayload,
  stream: true,
  success: SessionStreamEvent,
});

export const SessionRpcs = [SessionGetRpc, SessionCreateRpc, SessionModelsListRpc, SessionMessageSendRpc] as const;
