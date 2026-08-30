import {Schema} from "effect";
import {ModelReference, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";

export const SendMessagePayload = Schema.Struct({
  captureCheckpoints: Schema.optional(Schema.Boolean),
  contentParts: Schema.Array(UserMessageContentPart),
  modelReference: ModelReference,
  sessionId: Schema.String,
});

export type SendMessagePayload = typeof SendMessagePayload.Type;
