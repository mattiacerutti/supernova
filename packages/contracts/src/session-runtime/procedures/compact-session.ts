import {Schema} from "effect";
import {ModelReference} from "@supernova/contracts/sessions/schemas";

export const CompactSessionPayload = Schema.Struct({
  model: ModelReference,
  sessionId: Schema.String,
});

export type CompactSessionPayload = typeof CompactSessionPayload.Type;
