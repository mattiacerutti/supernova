import {z} from "zod";
import {OutgoingMessage} from "@supernova/contracts/services/sessions/schemas";

export const SendMessagePayload = OutgoingMessage.extend({sessionId: z.string()});

export type SendMessagePayload = z.infer<typeof SendMessagePayload>;
