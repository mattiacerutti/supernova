import {Schema} from "effect";

export const AgentChatSummary = Schema.Struct({
  id: Schema.String,
  messageCount: Schema.Number,
  title: Schema.String,
  updatedAt: Schema.String,
});
export type IAgentChatSummary = typeof AgentChatSummary.Type;

export const AgentProjectSessionsListResult = Schema.Struct({
  projectPath: Schema.String,
  sessions: Schema.Array(AgentChatSummary),
});
export type IAgentProjectSessionsListResult = typeof AgentProjectSessionsListResult.Type;

export class AgentProjectSessionsListError extends Schema.TaggedErrorClass<AgentProjectSessionsListError>()("AgentProjectSessionsListError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}
