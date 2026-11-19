import {bool, obj, type Static, str} from "@earendil-works/chord";

export const PinSessionPayload = obj({
  sessionId: str(),
  pinned: bool(),
});

export type PinSessionPayload = Static<typeof PinSessionPayload>;
