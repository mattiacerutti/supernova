import {z} from "zod";
import {TaggedError} from "@supernova/contracts/lib/errors";

export const RenameSessionPayload = z.object({
  sessionId: z.string(),
  title: z.string(),
});

export class RenameSessionError extends TaggedError("RenameSessionError") {}

export type RenameSessionPayload = z.infer<typeof RenameSessionPayload>;
