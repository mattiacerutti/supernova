import * as Rpc from "effect/unstable/rpc/Rpc";
import {
  AbortSessionPayload,
  CompactSessionPayload,
  RedoCheckpointPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  SessionStreamEvent,
  UndoCheckpointPayload,
  WatchEventsPayload,
} from "@supernova/contracts/session-runtime/procedures";

export const SendMessageRpc = Rpc.make("sendMessage", {
  payload: SendMessagePayload,
});

export const AbortSessionRpc = Rpc.make("abortSession", {
  payload: AbortSessionPayload,
});

export const CompactSessionRpc = Rpc.make("compactSession", {
  payload: CompactSessionPayload,
});

export const RevertToMessageRpc = Rpc.make("revertToMessage", {
  payload: RevertToMessagePayload,
});

export const UndoCheckpointRpc = Rpc.make("undoCheckpoint", {
  payload: UndoCheckpointPayload,
});

export const RedoCheckpointRpc = Rpc.make("redoCheckpoint", {
  payload: RedoCheckpointPayload,
});

export const WatchEventsRpc = Rpc.make("watchEvents", {
  payload: WatchEventsPayload,
  stream: true,
  success: SessionStreamEvent,
});

export const SessionRuntimeRpcs = [SendMessageRpc, AbortSessionRpc, CompactSessionRpc, RevertToMessageRpc, UndoCheckpointRpc, RedoCheckpointRpc, WatchEventsRpc] as const;
