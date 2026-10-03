import {z} from "zod";
import {struct} from "@supernova/contracts/runtime/schemas";

export const FolderCreatePayload = struct({
  path: z.string(),
});

export const FolderCreateResult = struct({
  path: z.string(),
});

export type FolderCreatePayload = z.infer<typeof FolderCreatePayload>;
export type FolderCreateResult = z.infer<typeof FolderCreateResult>;
