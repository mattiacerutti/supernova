import {obj, type Static, str} from "@earendil-works/chord";
import {TaggedError} from "@supernova/contracts/lib/errors";

export const ForkSessionPayload = obj({
  sessionId: str(),
  turnId: str(),
});

export class ForkSessionError extends TaggedError("ForkSessionError") {}

export type ForkSessionPayload = Static<typeof ForkSessionPayload>;
