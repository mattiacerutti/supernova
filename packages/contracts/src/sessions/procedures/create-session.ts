import {Schema} from "effect";
import {AgentSessionDetails} from "../schemas";

export const AgentSessionCreatePayload = Schema.Struct({
  projectPath: Schema.String,
});

export const AgentSessionCreateResult = AgentSessionDetails;

export class AgentSessionCreateError extends Schema.TaggedErrorClass<AgentSessionCreateError>()("AgentSessionCreateError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type AgentSessionCreatePayload = typeof AgentSessionCreatePayload.Type;
export type AgentSessionCreateResult = typeof AgentSessionCreateResult.Type;
