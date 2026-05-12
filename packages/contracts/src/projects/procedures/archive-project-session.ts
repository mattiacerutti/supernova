import {Schema} from "effect";

export const AgentProjectSessionArchivePayload = Schema.Struct({
  projectPath: Schema.String,
  sessionId: Schema.String,
});

export const AgentProjectSessionArchiveResult = Schema.Struct({
  projectPath: Schema.String,
  sessionId: Schema.String,
});

export class AgentProjectSessionArchiveError extends Schema.TaggedErrorClass<AgentProjectSessionArchiveError>()("AgentProjectSessionArchiveError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type IAgentProjectSessionArchivePayload = typeof AgentProjectSessionArchivePayload.Type;
export type IAgentProjectSessionArchiveResult = typeof AgentProjectSessionArchiveResult.Type;
