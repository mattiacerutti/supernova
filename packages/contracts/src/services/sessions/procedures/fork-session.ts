import {z} from "zod";
import {TaggedError} from "@supernova/contracts/lib/errors";

export const ForkSessionPayload = z.object({
  sessionId: z.string(),
  /** Turn the fork ends with, included. */
  turnId: z.string(),
});

export class ForkSessionError extends TaggedError("ForkSessionError") {}

export type ForkSessionPayload = z.infer<typeof ForkSessionPayload>;
