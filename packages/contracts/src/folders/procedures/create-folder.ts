import {Schema} from "effect";

export const AgentFolderCreatePayload = Schema.Struct({
  path: Schema.String,
});

export const AgentFolderCreateResult = Schema.Struct({
  path: Schema.String,
});

export class AgentFolderCreateError extends Schema.TaggedErrorClass<AgentFolderCreateError>()("AgentFolderCreateError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type AgentFolderCreatePayload = typeof AgentFolderCreatePayload.Type;
export type AgentFolderCreateResult = typeof AgentFolderCreateResult.Type;
