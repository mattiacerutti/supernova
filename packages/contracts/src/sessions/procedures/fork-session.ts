import {Schema} from "effect";

export const ForkSessionPayload = Schema.Struct({
  sessionId: Schema.String,
  /** Turn the fork ends with, included. */
  turnId: Schema.String,
});

export class ForkSessionError extends Schema.TaggedErrorClass<ForkSessionError>()("ForkSessionError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type ForkSessionPayload = typeof ForkSessionPayload.Type;
