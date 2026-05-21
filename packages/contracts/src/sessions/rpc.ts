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
  ListModelsError,
  ListModelsPayload,
  ListModelsResult,
  SendMessageEvent,
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
  stream: true,
  success: SendMessageEvent,
});

export const SessionRpcs = [GetSessionRpc, CreateSessionRpc, ListModelsRpc, ListComposerSuggestionsRpc, SendMessageRpc] as const;
