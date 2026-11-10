import {obj, type Static, str} from "@earendil-works/chord";

export const SessionIdPayload = obj({
  sessionId: str(),
});

export type SessionIdPayload = Static<typeof SessionIdPayload>;
