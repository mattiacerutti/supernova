import {execFile} from "node:child_process";
import {stat} from "node:fs/promises";
import {basename, dirname, join} from "node:path";
import {promisify} from "node:util";
import {Effect} from "effect";
import {FolderFilesListError} from "@supernova/contracts/folders/procedures";
import type {FolderFile} from "@supernova/contracts/folders/schemas";

const execFilePromise = promisify(execFile);
const FD_MAX_RESULTS = 100;
const MAX_SUGGESTIONS = 20;

interface ProjectPathEntry {
  readonly isDirectory: boolean;
  readonly path: string;
}

function toDisplayPath(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Escapes regex metacharacters before passing user input to fd. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Converts a slash-delimited query into an fd path pattern. */
function buildFdPathQuery(query: string): string {
  const normalized = toDisplayPath(query);
  if (!normalized.includes("/")) return normalized;

  const hasTrailingSeparator = normalized.endsWith("/");
  const trimmed = normalized.replace(/^\/+|\/+$/g, "");
  if (!trimmed) return normalized;

  const pattern = trimmed
    .split("/")
    .filter(Boolean)
    .map((segment) => escapeRegex(segment))
    .join("[\\\\/]");

  return hasTrailingSeparator ? `${pattern}[\\\\/]` : pattern;
}

/** Narrows a file query to the deepest existing directory prefix. */
async function scopedQuery(projectPath: string, query: string): Promise<{baseDir: string; displayBase: string; query: string}> {
  const normalizedQuery = toDisplayPath(query);
  const slashIndex = normalizedQuery.lastIndexOf("/");
  if (slashIndex === -1) return {baseDir: projectPath, displayBase: "", query: normalizedQuery};

  const displayBase = normalizedQuery.slice(0, slashIndex + 1);
  const baseDir = join(projectPath, displayBase);
  const baseDirStats = await stat(baseDir).catch(() => undefined);
  if (!baseDirStats?.isDirectory()) return {baseDir: projectPath, displayBase: "", query: normalizedQuery};

  return {
    baseDir,
    displayBase,
    query: normalizedQuery.slice(slashIndex + 1),
  };
}

/** Runs fd inside the project and annotates matching paths with directory status. */
async function runFd(projectPath: string, query: string): Promise<ProjectPathEntry[]> {
  const scope = await scopedQuery(projectPath, query);
  // TODO: Resolve/provision the fd binary instead of assuming it is available on PATH.
  const args = [
    "--base-directory",
    scope.baseDir,
    "--max-results",
    String(FD_MAX_RESULTS),
    "--type",
    "f",
    "--type",
    "d",
    "--follow",
    "--hidden",
    "--exclude",
    ".git",
    "--exclude",
    ".git/*",
    "--exclude",
    ".git/**",
  ];

  if (toDisplayPath(scope.query).includes("/")) args.push("--full-path");
  if (scope.query) args.push(buildFdPathQuery(scope.query));

  const result = await execFilePromise("fd", args, {cwd: projectPath, encoding: "utf8", maxBuffer: 10 * 1024 * 1024});
  const entries = String(result.stdout)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return Promise.all(
    entries.map(async (entry): Promise<ProjectPathEntry> => {
      const path = toDisplayPath(`${scope.displayBase}${entry}`).replace(/\/+$/g, "");
      const stats = await stat(join(projectPath, path)).catch(() => undefined);
      return {isDirectory: stats?.isDirectory() === true, path};
    })
  );
}

/** Scores a path match for composer file suggestions. */
function scoreEntry(entry: ProjectPathEntry, query: string): number {
  if (!query) return 1;

  const fileName = basename(entry.path).toLowerCase();
  const lowerQuery = query.toLowerCase();
  const path = entry.path.toLowerCase();
  const score = fileName === lowerQuery ? 100 : fileName.startsWith(lowerQuery) ? 80 : fileName.includes(lowerQuery) ? 50 : path.includes(lowerQuery) ? 30 : 0;

  return entry.isDirectory && score > 0 ? score + 10 : score;
}

function toFolderFile(entry: ProjectPathEntry): FolderFile {
  const path = entry.isDirectory ? `${entry.path}/` : entry.path;
  const parent = dirname(path);
  return {
    path: `@${path}`,
    subtitle: parent === "." ? undefined : parent,
    title: basename(path),
  };
}

/** Lists project files and folders for @-mention composer suggestions. */
export function listFolderFiles(projectPath: string, query: string) {
  return Effect.tryPromise({
    try: async () => {
      const normalizedQuery = query.trim().replace(/^@/, "");
      const entries = await runFd(projectPath, normalizedQuery).catch(() => []);
      const scope = await scopedQuery(projectPath, normalizedQuery);
      const items = entries
        .map((entry) => ({entry, score: scoreEntry(entry, scope.query)}))
        .filter((item) => item.score > 0)
        .toSorted((left, right) => right.score - left.score)
        .slice(0, MAX_SUGGESTIONS)
        .map((item) => item.entry);

      return {
        items: items.map(toFolderFile),
        query,
      };
    },
    catch: (cause) =>
      new FolderFilesListError({
        cause,
        message: cause instanceof Error ? cause.message : "Failed to list folder files.",
      }),
  });
}
