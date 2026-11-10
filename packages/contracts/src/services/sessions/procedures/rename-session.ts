import {obj, type Static, str} from "@earendil-works/chord";
import {TaggedError} from "@supernova/contracts/lib/errors";

export const RenameSessionPayload = obj({
  sessionId: str(),
  title: str(),
});

export class RenameSessionError extends TaggedError("RenameSessionError") {}

export type RenameSessionPayload = Static<typeof RenameSessionPayload>;
