import {Schema} from "effect";
import {ModelReference} from "./model";
import {UserMessageContentPart} from "./user-message";

/** A message the user sends to start a turn, whether in an existing session or as the first message of a new one. */
export const OutgoingMessage = Schema.Struct({
  captureCheckpoints: Schema.optional(Schema.Boolean),
  contentParts: Schema.Array(UserMessageContentPart),
  modelReference: ModelReference,
});

export type OutgoingMessage = typeof OutgoingMessage.Type;
