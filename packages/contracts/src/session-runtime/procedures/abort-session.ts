import {Schema} from "effect";

export const AbortSessionPayload = Schema.Struct({
  sessionId: Schema.String,
});

export type AbortSessionPayload = typeof AbortSessionPayload.Type;
