import {Schema} from "effect";
import {AgentSessionDetails} from "../schemas";

export const AgentSessionGetPayload = Schema.Struct({
  sessionId: Schema.String,
});

export const AgentSessionGetResult = AgentSessionDetails;

export class AgentSessionLoadError extends Schema.TaggedErrorClass<AgentSessionLoadError>()("AgentSessionLoadError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type AgentSessionGetPayload = typeof AgentSessionGetPayload.Type;
export type AgentSessionGetResult = typeof AgentSessionGetResult.Type;
