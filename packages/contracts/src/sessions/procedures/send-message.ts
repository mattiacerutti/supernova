import {Schema} from "effect";
import {ModelReference, UserMessageContentPart} from "../schemas";

export const SendMessagePayload = Schema.Struct({
  contentParts: Schema.Array(UserMessageContentPart),
  model: ModelReference,
  sessionId: Schema.String,
});

export type SendMessagePayload = typeof SendMessagePayload.Type;
