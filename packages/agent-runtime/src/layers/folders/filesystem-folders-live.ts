import {Layer} from "effect";
import {FoldersService} from "@supernova/agent-runtime/services/folders-service";
import {createFolder} from "@supernova/agent-runtime/layers/folders/operations/create-folder";
import {listFolderFiles} from "@supernova/agent-runtime/layers/folders/operations/list-folder-files";
import {listFolderSuggestions} from "@supernova/agent-runtime/layers/folders/operations/list-folder-suggestions";

export const FileSystemFoldersLive = Layer.succeed(FoldersService, {
  create: createFolder,
  listFiles: listFolderFiles,
  listSuggestions: listFolderSuggestions,
});
