import {TaggedError} from "@supernova/contracts/lib/errors";

/** A package could not be checked or installed; the message carries Pi's npm or git output. */
export class UpdateExtensionsError extends TaggedError("UpdateExtensionsError") {}
