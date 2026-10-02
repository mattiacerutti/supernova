import {z} from "zod";
import {struct, TaggedError} from "@supernova/contracts/runtime/schemas";

export const FolderCreatePayload = struct({
  path: z.string(),
});

export const FolderCreateResult = struct({
  path: z.string(),
});

export class FolderCreateError extends TaggedError("FolderCreateError") {}

export type FolderCreatePayload = z.infer<typeof FolderCreatePayload>;
export type FolderCreateResult = z.infer<typeof FolderCreateResult>;
