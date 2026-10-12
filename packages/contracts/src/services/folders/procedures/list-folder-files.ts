import {z} from "zod";
import {FolderFile} from "@supernova/contracts/services/folders/schemas";

export const FolderFilesListPayload = z.object({
  projectPath: z.string(),
  query: z.string(),
});

export const FolderFilesListResult = z.object({
  items: z.array(FolderFile),
  query: z.string(),
});

export type FolderFilesListPayload = z.infer<typeof FolderFilesListPayload>;
export type FolderFilesListResult = z.infer<typeof FolderFilesListResult>;
