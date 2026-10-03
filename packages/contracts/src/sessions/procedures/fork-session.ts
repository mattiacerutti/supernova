import {z} from "zod";
import {struct, TaggedError} from "@supernova/contracts/runtime/schemas";

export const ForkSessionPayload = struct({
  sessionId: z.string(),
  /** Turn the fork ends with, included. */
  turnId: z.string(),
});

export class ForkSessionError extends TaggedError("ForkSessionError") {}

export type ForkSessionPayload = z.infer<typeof ForkSessionPayload>;
