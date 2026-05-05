import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import {Schema} from "effect";
import {AgentFolderSuggestionsListError, AgentFolderSuggestionsListResult} from "@pi-desktop/contracts/folders";
import {
  AgentProviderApiKeySetError,
  AgentProviderApiKeySetResult,
  AgentProviderLoginError,
  AgentProviderLoginSession,
  AgentProviderLogoutError,
  AgentProviderLogoutResult,
  AgentProvidersListError,
  AgentProvidersListResult,
} from "@pi-desktop/contracts/providers";
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

export const AgentProvidersListRpc = Rpc.make("listProviders", {
  error: AgentProvidersListError,
  payload: Schema.Void,
  success: AgentProvidersListResult,
});

export const AgentProviderApiKeySetRpc = Rpc.make("setProviderApiKey", {
  error: AgentProviderApiKeySetError,
  payload: Schema.Struct({
    apiKey: Schema.String,
    providerId: Schema.String,
  }),
  success: AgentProviderApiKeySetResult,
});

export const AgentProviderOAuthLoginStartRpc = Rpc.make("startProviderOAuthLogin", {
  error: AgentProviderLoginError,
  payload: Schema.Struct({
    providerId: Schema.String,
  }),
  success: AgentProviderLoginSession,
});

export const AgentProviderLoginSessionGetRpc = Rpc.make("getProviderLoginSession", {
  error: AgentProviderLoginError,
  payload: Schema.Struct({
    loginSessionId: Schema.String,
  }),
  success: AgentProviderLoginSession,
});

export const AgentProviderLoginInputSubmitRpc = Rpc.make("submitProviderLoginInput", {
  error: AgentProviderLoginError,
  payload: Schema.Struct({
    input: Schema.String,
    loginSessionId: Schema.String,
  }),
  success: AgentProviderLoginSession,
});

export const AgentProviderLoginCancelRpc = Rpc.make("cancelProviderLogin", {
  error: AgentProviderLoginError,
  payload: Schema.Struct({
    loginSessionId: Schema.String,
  }),
  success: AgentProviderLoginSession,
});

export const AgentProviderLogoutRpc = Rpc.make("logoutProvider", {
  error: AgentProviderLogoutError,
  payload: Schema.Struct({
    providerId: Schema.String,
  }),
  success: AgentProviderLogoutResult,
});

export const AgentRpcGroup = RpcGroup.make(
  AgentFolderSuggestionsListRpc,
  AgentProjectSessionsListRpc,
  AgentProjectSessionArchiveRpc,
  AgentProvidersListRpc,
  AgentProviderApiKeySetRpc,
  AgentProviderOAuthLoginStartRpc,
  AgentProviderLoginSessionGetRpc,
  AgentProviderLoginInputSubmitRpc,
  AgentProviderLoginCancelRpc,
  AgentProviderLogoutRpc
);
