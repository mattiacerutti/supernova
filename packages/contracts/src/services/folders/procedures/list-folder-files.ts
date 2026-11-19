import {arr, obj, type Static, str} from "@earendil-works/chord";
import {FolderFile} from "@supernova/contracts/services/folders/schemas";

export const FolderFilesListPayload = obj({
  projectPath: str(),
  query: str(),
});

export const FolderFilesListResult = obj({
  items: arr(FolderFile),
  query: str(),
});

export type FolderFilesListPayload = Static<typeof FolderFilesListPayload>;
export type FolderFilesListResult = Static<typeof FolderFilesListResult>;
