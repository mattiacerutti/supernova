import * as Rpc from "effect/unstable/rpc/Rpc";
import {Schema} from "effect";
import {AgentProjectSessionArchiveError, AgentProjectSessionArchiveResult, AgentProjectSessionsListError, AgentProjectSessionsListResult} from "@pi-desktop/contracts/projects";

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

export const AgentProjectRpcs = [AgentProjectSessionsListRpc, AgentProjectSessionArchiveRpc] as const;
