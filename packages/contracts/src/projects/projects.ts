import {Schema} from "effect";
import {AgentSessionSummary} from "@pi-desktop/contracts/sessions";

export const AgentProjectSessionsListResult = Schema.Struct({
  hasMore: Schema.Boolean,
  nextCursor: Schema.optional(Schema.String),
  projectPath: Schema.String,
  sessions: Schema.Array(AgentSessionSummary),
});
export type IAgentProjectSessionsListResult = typeof AgentProjectSessionsListResult.Type;

export class AgentProjectSessionsListError extends Schema.TaggedErrorClass<AgentProjectSessionsListError>()("AgentProjectSessionsListError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export const AgentProjectSessionArchiveResult = Schema.Struct({
  projectPath: Schema.String,
  sessionId: Schema.String,
});
export type IAgentProjectSessionArchiveResult = typeof AgentProjectSessionArchiveResult.Type;

export class AgentProjectSessionArchiveError extends Schema.TaggedErrorClass<AgentProjectSessionArchiveError>()("AgentProjectSessionArchiveError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}
