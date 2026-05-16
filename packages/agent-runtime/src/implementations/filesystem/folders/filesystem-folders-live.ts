import {Layer} from "effect";
import {FoldersService} from "@pi-desktop/agent-runtime/services/folders/folders-service";
import {createFolder} from "@pi-desktop/agent-runtime/implementations/filesystem/folders/operations/create-folder";
import {listFolderFiles} from "@pi-desktop/agent-runtime/implementations/filesystem/folders/operations/list-folder-files";
import {listFolderSuggestions} from "@pi-desktop/agent-runtime/implementations/filesystem/folders/operations/list-folder-suggestions";

export const FileSystemFoldersLive = Layer.succeed(FoldersService, {
  create: createFolder,
  listFiles: listFolderFiles,
  listSuggestions: listFolderSuggestions,
});
