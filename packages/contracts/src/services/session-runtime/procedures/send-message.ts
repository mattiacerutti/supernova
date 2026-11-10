import type {Static} from "@earendil-works/chord";
import {OutgoingMessage} from "@supernova/contracts/services/sessions/schemas";

export const SendMessagePayload = OutgoingMessage;

export type SendMessagePayload = Static<typeof SendMessagePayload>;
