import {z} from "zod";
import {struct, TaggedError} from "@supernova/contracts/runtime/schemas";

export const RenameSessionPayload = struct({
  sessionId: z.string(),
  title: z.string(),
});

export class RenameSessionError extends TaggedError("RenameSessionError") {}

export type RenameSessionPayload = z.infer<typeof RenameSessionPayload>;
