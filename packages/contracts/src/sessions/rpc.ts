import * as Rpc from "effect/unstable/rpc/Rpc";
import {
  CreateSessionError,
  CreateSessionPayload,
  CreateSessionResult,
  ListComposerSuggestionsError,
  ListComposerSuggestionsPayload,
  ListComposerSuggestionsResult,
  GetSessionPayload,
  GetSessionResult,
  LoadSessionError,
  SendMessagePayload,
  CompactSessionPayload,
  ListModelsError,
  ListModelsPayload,
  ListModelsResult,
  AbortSessionPayload,
  WatchEventsPayload,
  SessionStreamEvent,
  RevertToMessagePayload,
  UndoCheckpointPayload,
  RedoCheckpointPayload,
} from "@supernova/contracts/sessions/procedures";

export const GetSessionRpc = Rpc.make("getSession", {
  error: LoadSessionError,
  payload: GetSessionPayload,
  success: GetSessionResult,
});

export const CreateSessionRpc = Rpc.make("createSession", {
  error: CreateSessionError,
  payload: CreateSessionPayload,
  success: CreateSessionResult,
});

export const ListModelsRpc = Rpc.make("listModels", {
  error: ListModelsError,
  payload: ListModelsPayload,
  success: ListModelsResult,
});

export const ListComposerSuggestionsRpc = Rpc.make("listComposerSuggestions", {
  error: ListComposerSuggestionsError,
  payload: ListComposerSuggestionsPayload,
  success: ListComposerSuggestionsResult,
});

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

export const SessionRpcs = [
  GetSessionRpc,
  CreateSessionRpc,
  ListModelsRpc,
  ListComposerSuggestionsRpc,
  SendMessageRpc,
  AbortSessionRpc,
  CompactSessionRpc,
  RevertToMessageRpc,
  UndoCheckpointRpc,
  RedoCheckpointRpc,
  WatchEventsRpc,
] as const;
