import {z} from "zod";
import {array, struct} from "@supernova/contracts/runtime/schemas";
import {FolderFile} from "@supernova/contracts/folders/schemas";

export const FolderFilesListPayload = struct({
  projectPath: z.string(),
  query: z.string(),
});

export const FolderFilesListResult = struct({
  items: array(FolderFile),
  query: z.string(),
});

export type FolderFilesListPayload = z.infer<typeof FolderFilesListPayload>;
export type FolderFilesListResult = z.infer<typeof FolderFilesListResult>;
