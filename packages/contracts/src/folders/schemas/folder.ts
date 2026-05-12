import {Schema} from "effect";

export const AgentFolderSuggestion = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
});

export const AgentFolderQueryPathType = Schema.Union([Schema.Literal("directory"), Schema.Literal("file"), Schema.Literal("missing")]);

export type IAgentFolderSuggestion = typeof AgentFolderSuggestion.Type;
export type AgentFolderQueryPathType = typeof AgentFolderQueryPathType.Type;
