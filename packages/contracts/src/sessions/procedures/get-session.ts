import {z} from "zod";
import {struct, TaggedError} from "@supernova/contracts/runtime/schemas";

export const GetSessionPayload = struct({
  sessionId: z.string(),
});

export class LoadSessionError extends TaggedError("LoadSessionError") {}

export type GetSessionPayload = z.infer<typeof GetSessionPayload>;
