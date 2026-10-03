import * as Rpc from "effect/unstable/rpc/Rpc";
import {
  ListComposerSuggestionsError,
  ListComposerSuggestionsPayload,
  ListComposerSuggestionsResult,
  ListModelsError,
  ListModelsPayload,
  ListModelsResult,
} from "@supernova/contracts/sessions/procedures";

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

/** Session lifecycle and execution are Chord services (`sessions/services`); these are project resources for the composer. */
export const SessionRpcs = [ListModelsRpc, ListComposerSuggestionsRpc] as const;
