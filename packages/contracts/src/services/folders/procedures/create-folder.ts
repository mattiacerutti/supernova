import {z} from "zod";

export const FolderCreatePayload = z.object({
  path: z.string(),
});

export const FolderCreateResult = z.object({
  path: z.string(),
});

export type FolderCreatePayload = z.infer<typeof FolderCreatePayload>;
export type FolderCreateResult = z.infer<typeof FolderCreateResult>;
