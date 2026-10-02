import {TaggedError} from "@supernova/contracts/runtime/schemas";

/** A session command (send, compact) was rejected: unknown or unauthenticated model, busy or read-only session. */
export class SessionCommandError extends TaggedError("SessionCommandError") {}
