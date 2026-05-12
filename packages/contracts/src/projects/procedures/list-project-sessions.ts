import {Schema} from "effect";
import {AgentSessionSummary} from "@pi-desktop/contracts/sessions/schemas";

export const AgentProjectSessionsListPayload = Schema.Struct({
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Number),
  projectPath: Schema.String,
});

export const AgentProjectSessionsListResult = Schema.Struct({
  hasMore: Schema.Boolean,
  nextCursor: Schema.optional(Schema.String),
  projectPath: Schema.String,
  sessions: Schema.Array(AgentSessionSummary),
});

export class AgentProjectSessionsListError extends Schema.TaggedErrorClass<AgentProjectSessionsListError>()("AgentProjectSessionsListError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type AgentProjectSessionsListPayload = typeof AgentProjectSessionsListPayload.Type;
export type AgentProjectSessionsListResult = typeof AgentProjectSessionsListResult.Type;
