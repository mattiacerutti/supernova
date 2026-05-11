import {Schema} from "effect";

export const AgentFolderSuggestion = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
});
export type IAgentFolderSuggestion = typeof AgentFolderSuggestion.Type;

export const AgentFolderCreateResult = Schema.Struct({
  path: Schema.String,
});
export type IAgentFolderCreateResult = typeof AgentFolderCreateResult.Type;

export class AgentFolderCreateError extends Schema.TaggedErrorClass<AgentFolderCreateError>()("AgentFolderCreateError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export const AgentFolderSuggestionsListResult = Schema.Struct({
  homePath: Schema.String,
  query: Schema.String,
  queryPath: Schema.String,
  queryPathType: Schema.Union([Schema.Literal("directory"), Schema.Literal("file"), Schema.Literal("missing")]),
  suggestions: Schema.Array(AgentFolderSuggestion),
});
export type IAgentFolderSuggestionsListResult = typeof AgentFolderSuggestionsListResult.Type;

export class AgentFolderSuggestionsListError extends Schema.TaggedErrorClass<AgentFolderSuggestionsListError>()("AgentFolderSuggestionsListError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}
