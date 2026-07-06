import {Schema} from "effect";
import {ModelReference} from "@supernova/contracts/sessions/schemas";

export const CompactSessionPayload = Schema.Struct({
  modelReference: ModelReference,
  sessionId: Schema.String,
});

export type CompactSessionPayload = typeof CompactSessionPayload.Type;
