import {Layer} from "effect";
import {FoldersService} from "@pi-desktop/agent-runtime/services/folders/folders-service";
import {listFolderSuggestions} from "@pi-desktop/agent-runtime/implementations/filesystem/folders/operations/list-folder-suggestions";

export const FileSystemFoldersLive = Layer.succeed(FoldersService, {
  listSuggestions: listFolderSuggestions,
});
