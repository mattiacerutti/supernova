import {optionalGit, runGit, runGitResult} from "@supernova/agent-runtime/lib/git-process";

/** Pinned so user config cannot change a snapshot. Symlinks off on Windows: creating them needs elevation. */
const SYMLINKS_MODE = process.platform === "win32" ? "false" : "true";
const PINNED_CONFIG = ["-c", "core.autocrlf=false", "-c", "core.fsmonitor=false", "-c", "core.longpaths=true", "-c", `core.symlinks=${SYMLINKS_MODE}`];
const HASH_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const PRUNE_EXPIRY = "7.days";

export type GitObjectFormat = "sha1" | "sha256";

export interface GitTarget {
  readonly gitDir: string;
  readonly worktree: string;
}

interface RepositoryInfo {
  readonly bare: boolean;
  readonly gitDir: string;
  readonly indexPath: string;
  readonly objectDir: string;
  readonly objectFormat: GitObjectFormat;
  readonly topLevel: string;
}

interface TreeChange {
  readonly deleted: boolean;
  readonly path: string;
}

interface WorkspaceStatus {
  readonly changed: readonly string[];
  readonly untracked: readonly string[];
}

function targetArgs(target: GitTarget, args: readonly string[]): readonly string[] {
  return [...PINNED_CONFIG, `--git-dir=${target.gitDir}`, `--work-tree=${target.worktree}`, ...args];
}

function indexEnv(indexPath: string): NodeJS.ProcessEnv {
  return {...process.env, GIT_INDEX_FILE: indexPath};
}

function nulRecords(value: string): readonly string[] {
  return value.split("\0").filter(Boolean);
}

function nulPaths(paths: readonly string[]): Buffer {
  return Buffer.from(`${paths.join("\0")}\0`);
}

/** Literal, top-anchored pathspecs, so nothing in a path is interpreted as a pattern. */
function pathspecs(paths: readonly string[]): Buffer {
  return Buffer.from(`${paths.map((path) => `:(top,literal)${path}`).join("\0")}\0`);
}

function fieldAfterSpaces(record: string, spaces: number): string | undefined {
  let offset = -1;
  for (let count = 0; count < spaces; count++) {
    offset = record.indexOf(" ", offset + 1);
    if (offset === -1) return undefined;
  }
  return record.slice(offset + 1) || undefined;
}

export async function readRepositoryInfo(directory: string): Promise<RepositoryInfo | undefined> {
  const output = await optionalGit([
    "-C",
    directory,
    "rev-parse",
    "--show-toplevel",
    "--is-bare-repository",
    "--absolute-git-dir",
    "--show-object-format",
    "--path-format=absolute",
    "--git-path",
    "objects",
    "--git-path",
    "index",
  ]);
  const [topLevel, bare, gitDir, objectFormat, objectDir, indexPath] = output?.split("\n").map((line) => line.trim()) ?? [];
  if (!topLevel || !bare || !gitDir || !objectDir || !indexPath) return undefined;
  if (objectFormat !== "sha1" && objectFormat !== "sha256") throw new Error("Unsupported Git object format.");

  return {bare: bare === "true", gitDir, indexPath, objectDir, objectFormat, topLevel};
}

/** Local config beats the user's global config, so auto-maintenance never reclaims objects not yet pinned by a ref. */
export async function createShadowRepository(gitDir: string, objectFormat: GitObjectFormat): Promise<void> {
  await runGit(["init", "--bare", `--object-format=${objectFormat}`, gitDir]);

  const settings: ReadonlyArray<readonly [string, string]> = [
    ["gc.pruneExpire", PRUNE_EXPIRY],
    ["core.autocrlf", "false"],
    ["core.fsmonitor", "false"],
    ["core.longpaths", "true"],
    ["core.symlinks", SYMLINKS_MODE],
  ];
  for (const [key, value] of settings) await runGit([`--git-dir=${gitDir}`, "config", key, value]);
}

export async function listFlaggedPaths(target: GitTarget, indexPath: string): Promise<readonly string[]> {
  const output = await runGit(targetArgs(target, ["ls-files", "-v", "-z"]), {env: indexEnv(indexPath)});
  return nulRecords(output.stdout)
    .filter((record) => /^(?:S|[a-z]) /.test(record))
    .map((record) => record.slice(2));
}

/** Clears both flags that would hide worktree changes. The two options cannot be combined in one call. */
export async function clearIndexFlags(target: GitTarget, indexPath: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  const env = indexEnv(indexPath);
  const input = nulPaths(paths);
  await runGit(targetArgs(target, ["update-index", "--no-skip-worktree", "-z", "--stdin"]), {env, input});
  await runGit(targetArgs(target, ["update-index", "--no-assume-unchanged", "-z", "--stdin"]), {env, input});
}

/** Renames off so a delete+add pair is never collapsed; submodules skipped so status never recurses. */
export async function readWorkspaceStatus(target: GitTarget, indexPath: string): Promise<WorkspaceStatus> {
  const output = await runGit(targetArgs(target, ["status", "--porcelain=v2", "-z", "--no-renames", "--ignore-submodules=all", "--untracked-files=all", "--ignored=no"]), {
    env: indexEnv(indexPath),
  });
  const changed = new Set<string>();
  const untracked: string[] = [];
  const records = nulRecords(output.stdout);

  for (let index = 0; index < records.length; index++) {
    const record = records[index]!;
    if (record.startsWith("? ")) {
      untracked.push(record.slice(2));
      continue;
    }
    if (record.startsWith("1 ")) {
      const path = fieldAfterSpaces(record, 8);
      // A staged deletion never differs from the index, so no worktree comparison would report it.
      if (path && (record[3] !== "." || record[2] === "D")) changed.add(path);
      continue;
    }
    if (record.startsWith("u ")) {
      const path = fieldAfterSpaces(record, 10);
      if (path) changed.add(path);
      continue;
    }
    // Renames are disabled, but a rename record would carry its original path in a second field.
    if (record.startsWith("2 ")) index++;
  }

  return {changed: [...changed], untracked};
}

export async function removeCachedPaths(target: GitTarget, indexPath: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  await runGit(targetArgs(target, ["rm", "-r", "--cached", "--ignore-unmatch", "--pathspec-from-file=-", "--pathspec-file-nul"]), {
    env: indexEnv(indexPath),
    input: pathspecs(paths),
  });
}

export async function removeIndexPaths(target: GitTarget, indexPath: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  await runGit(targetArgs(target, ["update-index", "--force-remove", "-z", "--stdin"]), {env: indexEnv(indexPath), input: nulPaths(paths)});
}

export async function addPaths(target: GitTarget, indexPath: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  await runGit(targetArgs(target, ["add", "-f", "--sparse", "--pathspec-from-file=-", "--pathspec-file-nul"]), {env: indexEnv(indexPath), input: pathspecs(paths)});
}

export async function readTree(target: GitTarget, indexPath: string, treeId: string): Promise<void> {
  await runGit(targetArgs(target, ["read-tree", treeId]), {env: indexEnv(indexPath)});
}

export async function readEmptyTree(target: GitTarget, indexPath: string): Promise<void> {
  await runGit(targetArgs(target, ["read-tree", "--empty"]), {env: indexEnv(indexPath)});
}

export async function writeTree(target: GitTarget, indexPath: string): Promise<string> {
  const treeId = (await runGit(targetArgs(target, ["write-tree"]), {env: indexEnv(indexPath)})).stdout.trim();
  if (!HASH_PATTERN.test(treeId)) throw new Error("Git returned an invalid checkpoint tree.");
  return treeId;
}

export async function diffTrees(target: GitTarget, fromTreeId: string, toTreeId: string): Promise<readonly TreeChange[]> {
  const output = await runGit(targetArgs(target, ["diff", "--name-status", "--no-renames", "-z", fromTreeId, toTreeId]));
  const fields = nulRecords(output.stdout);
  const changes: TreeChange[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const path = fields[index + 1];
    if (status && path) changes.push({deleted: status.startsWith("D"), path});
  }
  return changes;
}

export async function listTreePaths(target: GitTarget, treeId: string): Promise<readonly string[]> {
  const output = await runGit(targetArgs(target, ["ls-tree", "-r", "--name-only", "-z", treeId, "--"]));
  return nulRecords(output.stdout);
}

export async function restoreWorktreePaths(target: GitTarget, indexPath: string, treeId: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  const env = indexEnv(indexPath);
  await runGit(targetArgs(target, ["read-tree", treeId]), {env});
  await runGit(targetArgs(target, ["restore", "--source", treeId, "--worktree", "--pathspec-from-file=-", "--pathspec-file-nul"]), {env, input: pathspecs(paths)});
}

export async function writeRef(gitDir: string, ref: string, objectId: string): Promise<void> {
  await runGit([`--git-dir=${gitDir}`, "update-ref", ref, objectId]);
}

export async function deleteRef(gitDir: string, ref: string): Promise<void> {
  await runGitResult([`--git-dir=${gitDir}`, "update-ref", "-d", ref]);
}

export async function deleteRefs(gitDir: string, refs: readonly string[]): Promise<void> {
  if (refs.length === 0) return;
  const input = Buffer.from(refs.map((ref) => `delete ${ref}\n`).join(""));
  await runGitResult([`--git-dir=${gitDir}`, "update-ref", "--stdin"], {input});
}

export async function listRefs(gitDir: string, prefix: string): Promise<readonly string[]> {
  const output = await optionalGit([`--git-dir=${gitDir}`, "for-each-ref", "--format=%(refname)", prefix]);
  return output ? output.split("\n").filter(Boolean) : [];
}

export async function resolveRefTree(gitDir: string, ref: string): Promise<string> {
  const output = await runGit([`--git-dir=${gitDir}`, "rev-parse", `${ref}^{tree}`]);
  return output.stdout.trim();
}

export async function collectGarbage(gitDir: string): Promise<void> {
  await runGitResult([`--git-dir=${gitDir}`, "gc", `--prune=${PRUNE_EXPIRY}`]);
}
