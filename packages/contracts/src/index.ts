import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import {Schema} from "effect";
import {AgentFolderSuggestionsListError, AgentFolderSuggestionsListResult} from "@pi-desktop/contracts/folders";
import {AgentProjectSessionArchiveError, AgentProjectSessionArchiveResult, AgentProjectSessionsListError, AgentProjectSessionsListResult} from "@pi-desktop/contracts/projects";

export const AgentFolderSuggestionsListRpc = Rpc.make("listFolderSuggestions", {
  error: AgentFolderSuggestionsListError,
  payload: Schema.Struct({
    query: Schema.String,
  }),
  success: AgentFolderSuggestionsListResult,
});

export const AgentProjectSessionsListRpc = Rpc.make("listProjectSessions", {
  error: AgentProjectSessionsListError,
  payload: Schema.Struct({
    cursor: Schema.optional(Schema.String),
    limit: Schema.optional(Schema.Number),
    projectPath: Schema.String,
  }),
  success: AgentProjectSessionsListResult,
});

export const AgentProjectSessionArchiveRpc = Rpc.make("archiveProjectSession", {
  error: AgentProjectSessionArchiveError,
  payload: Schema.Struct({
    projectPath: Schema.String,
    sessionId: Schema.String,
  }),
  success: AgentProjectSessionArchiveResult,
});

export const AgentRpcGroup = RpcGroup.make(AgentFolderSuggestionsListRpc, AgentProjectSessionsListRpc, AgentProjectSessionArchiveRpc);
