import {mkdir} from "node:fs/promises";
import {homedir} from "node:os";
import type {
  FolderCreatePayload,
  FolderCreateResult,
  FolderFilesListPayload,
  FolderFilesListResult,
  FolderSuggestionsListPayload,
  FolderSuggestionsListResult,
} from "@supernova/contracts/services/folders/procedures";
import {searchProjectFiles} from "@supernova/agent-runtime/features/folders/lib/file-search";
import {readFolderPathType, searchFolders} from "@supernova/agent-runtime/features/folders/lib/folder-search";
import {normalizePathForDisplay, resolveFolderPath} from "@supernova/agent-runtime/features/folders/lib/paths";

export class Folders {
  public async create(input: FolderCreatePayload): Promise<FolderCreateResult> {
    const resolvedPath = resolveFolderPath(input.path);
    await mkdir(resolvedPath, {recursive: true});
    return {path: normalizePathForDisplay(resolvedPath)};
  }

  public async listFiles(input: FolderFilesListPayload): Promise<FolderFilesListResult> {
    return {items: await searchProjectFiles(input.projectPath, input.query), query: input.query};
  }

  public async listSuggestions(input: FolderSuggestionsListPayload): Promise<FolderSuggestionsListResult> {
    const {query} = input;
    const queryPath = query.trim().length > 0 ? resolveFolderPath(query) : homedir();

    return {
      homePath: normalizePathForDisplay(homedir()),
      query,
      queryPath: normalizePathForDisplay(queryPath),
      queryPathType: await readFolderPathType(queryPath),
      suggestions: await searchFolders(query),
    };
  }
}
