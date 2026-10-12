import {z} from "zod";

export const FolderSuggestion = z.object({
  name: z.string(),
  path: z.string(),
});

export const FolderFile = z.object({
  path: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
});

export const FolderQueryPathType = z.union([z.literal("directory"), z.literal("file"), z.literal("missing")]);

export type FolderSuggestion = z.infer<typeof FolderSuggestion>;
export type FolderFile = z.infer<typeof FolderFile>;
export type FolderQueryPathType = z.infer<typeof FolderQueryPathType>;
