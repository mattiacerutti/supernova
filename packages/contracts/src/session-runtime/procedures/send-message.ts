import {z} from "zod";
import {OutgoingMessage} from "@supernova/contracts/sessions/schemas";

export const SendMessagePayload = OutgoingMessage.unwrap().extend({sessionId: z.string()}).readonly();

export type SendMessagePayload = z.infer<typeof SendMessagePayload>;
