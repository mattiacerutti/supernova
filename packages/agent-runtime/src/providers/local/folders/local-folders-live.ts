import {Layer} from "effect";
import {FoldersService} from "@pi-desktop/agent-runtime/services/folders/folders-service";
import {listFolderSuggestions} from "@pi-desktop/agent-runtime/providers/local/folders/operations/list-folder-suggestions";

export const LocalFoldersLive = Layer.succeed(FoldersService, {
  listSuggestions: listFolderSuggestions,
});
