import {obj, oneOf, opt, type Static, str} from "@earendil-works/chord";

export const FolderSuggestion = obj({
  name: str(),
  path: str(),
});

export const FolderFile = obj({
  path: str(),
  title: str(),
  subtitle: opt(str()),
});

export const FolderQueryPathType = oneOf("directory", "file", "missing");

export type FolderSuggestion = Static<typeof FolderSuggestion>;
export type FolderFile = Static<typeof FolderFile>;
export type FolderQueryPathType = Static<typeof FolderQueryPathType>;
