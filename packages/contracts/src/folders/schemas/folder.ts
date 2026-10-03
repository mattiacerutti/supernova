import {z} from "zod";
import {struct} from "@supernova/contracts/runtime/schemas";

export const FolderSuggestion = struct({
  name: z.string(),
  path: z.string(),
});

export const FolderFile = struct({
  path: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
});

export const FolderQueryPathType = z.union([z.literal("directory"), z.literal("file"), z.literal("missing")]);

export type FolderSuggestion = z.infer<typeof FolderSuggestion>;
export type FolderFile = z.infer<typeof FolderFile>;
export type FolderQueryPathType = z.infer<typeof FolderQueryPathType>;
