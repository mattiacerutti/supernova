import {Schema} from "effect";
import {OutgoingMessage} from "@supernova/contracts/sessions/schemas";

export const SendMessagePayload = Schema.Struct({
  ...OutgoingMessage.fields,
  sessionId: Schema.String,
});

export type SendMessagePayload = typeof SendMessagePayload.Type;
