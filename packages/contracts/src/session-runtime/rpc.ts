import * as Rpc from "effect/unstable/rpc/Rpc";
import {
  AbortSessionPayload,
  CheckpointNavigationError,
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
  error: CheckpointNavigationError,
  payload: RevertToMessagePayload,
});

export const UndoCheckpointRpc = Rpc.make("undoCheckpoint", {
  error: CheckpointNavigationError,
  payload: UndoCheckpointPayload,
});

export const RedoCheckpointRpc = Rpc.make("redoCheckpoint", {
  error: CheckpointNavigationError,
  payload: RedoCheckpointPayload,
});

export const WatchEventsRpc = Rpc.make("watchEvents", {
  payload: WatchEventsPayload,
  stream: true,
  success: SessionStreamEvent,
});

export const SessionRuntimeRpcs = [SendMessageRpc, AbortSessionRpc, CompactSessionRpc, RevertToMessageRpc, UndoCheckpointRpc, RedoCheckpointRpc, WatchEventsRpc] as const;
