import {obj, type Static, str} from "@earendil-works/chord";

export const FolderCreatePayload = obj({
  path: str(),
});

export const FolderCreateResult = obj({
  path: str(),
});

export type FolderCreatePayload = Static<typeof FolderCreatePayload>;
export type FolderCreateResult = Static<typeof FolderCreateResult>;
