import {Schema} from "effect";

export const AgentChatSummary = Schema.Struct({
  id: Schema.String,
  messageCount: Schema.Number,
  title: Schema.String,
  updatedAt: Schema.String,
});
export type AgentChatSummary = typeof AgentChatSummary.Type;

export const AgentProjectSummary = Schema.Struct({
  chats: Schema.Array(AgentChatSummary),
  id: Schema.String,
  name: Schema.String,
  updatedAt: Schema.String,
});
export type AgentProjectSummary = typeof AgentProjectSummary.Type;

export const AgentProjectsListResult = Schema.Struct({
  projects: Schema.Array(AgentProjectSummary),
});
export type AgentProjectsListResult = typeof AgentProjectsListResult.Type;

export class AgentProjectsListError extends Schema.TaggedErrorClass<AgentProjectsListError>()("AgentProjectsListError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}
