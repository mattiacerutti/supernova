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
import {normalizePathForDisplay} from "@supernova/agent-runtime/features/folders/lib/paths";
import {resolveProjectPath} from "@supernova/agent-runtime/lib/project-path";

export async function createFolder(input: FolderCreatePayload): Promise<FolderCreateResult> {
  const resolvedPath = resolveProjectPath(input.path.trim());
  await mkdir(resolvedPath, {recursive: true});
  return {path: resolvedPath};
}

export async function listFolderFiles(input: FolderFilesListPayload): Promise<FolderFilesListResult> {
  return {items: await searchProjectFiles(input.projectPath, input.query), query: input.query};
}

export async function listFolderSuggestions(input: FolderSuggestionsListPayload): Promise<FolderSuggestionsListResult> {
  const {query} = input;
  const queryPath = query.trim().length > 0 ? resolveProjectPath(query.trim()) : homedir();

  return {
    homePath: normalizePathForDisplay(homedir()),
    query,
    queryPath: normalizePathForDisplay(queryPath),
    queryPathType: await readFolderPathType(queryPath),
    suggestions: await searchFolders(query),
  };
}
