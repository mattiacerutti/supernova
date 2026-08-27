import {optionalGit, runGit, runGitResult} from "@supernova/agent-runtime/layers/session-runtime/internal/git/git-process";

/**
 * Config pinned on every checkpoint command so user settings cannot change what a snapshot contains.
 *
 * Disabling the filesystem monitor keeps checkpoint commands from starting or consulting a daemon for
 * the user's worktree, and keeps monitor state copied from the user's index from being trusted.
 */
const PINNED_CONFIG = ["-c", "core.autocrlf=false", "-c", "core.fsmonitor=false", "-c", "core.longpaths=true", "-c", "core.symlinks=true"];
const HASH_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const PRUNE_EXPIRY = "7.days";

export type GitObjectFormat = "sha1" | "sha256";

/** A shadow repository paired with the user worktree its commands operate on. */
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

/** Returns the remainder of a record after the given number of spaces, which is how porcelain v2 delimits paths. */
function fieldAfterSpaces(record: string, spaces: number): string | undefined {
  let offset = -1;
  for (let count = 0; count < spaces; count++) {
    offset = record.indexOf(" ", offset + 1);
    if (offset === -1) return undefined;
  }
  return record.slice(offset + 1) || undefined;
}

/** Reads every repository property capture needs in one invocation, because spawning Git per candidate is the cost. */
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

/**
 * Creates the app-owned bare repository that stores checkpoint objects and refs.
 *
 * The prune window is written to the repository's own config rather than passed per command, because
 * local config beats the user's global config. That is what keeps automatic maintenance from
 * reclaiming objects a capture has written but not yet pinned with a ref.
 */
export async function createShadowRepository(gitDir: string, objectFormat: GitObjectFormat): Promise<void> {
  await runGit(["init", "--bare", `--object-format=${objectFormat}`, gitDir]);

  const settings: ReadonlyArray<readonly [string, string]> = [
    ["gc.pruneExpire", PRUNE_EXPIRY],
    ["core.autocrlf", "false"],
    ["core.fsmonitor", "false"],
    ["core.longpaths", "true"],
    ["core.symlinks", "true"],
  ];
  for (const [key, value] of settings) await runGit([`--git-dir=${gitDir}`, "config", key, value]);
}

/** Returns the index entries carrying `skip-worktree` or `assume-unchanged`, which hide worktree changes. */
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

/**
 * Reports worktree changes, staged deletions, and untracked paths, refreshing the index as it goes.
 *
 * Renames stay off so a delete and add pair is never collapsed into one entry whose deletion we would
 * miss, and submodules are skipped so status never recurses into them.
 */
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

/** Drops paths and their children from the index without touching the worktree. */
export async function removeCachedPaths(target: GitTarget, indexPath: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  await runGit(targetArgs(target, ["rm", "-r", "--cached", "--ignore-unmatch", "--pathspec-from-file=-", "--pathspec-file-nul"]), {
    env: indexEnv(indexPath),
    input: pathspecs(paths),
  });
}

/** Drops index entries so a rebuilt tree represents deletions by absence. */
export async function removeIndexPaths(target: GitTarget, indexPath: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  await runGit(targetArgs(target, ["update-index", "--force-remove", "-z", "--stdin"]), {env: indexEnv(indexPath), input: nulPaths(paths)});
}

/** Stages worktree content for the given paths, including files Git would otherwise ignore or sparse-skip. */
export async function addPaths(target: GitTarget, indexPath: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  await runGit(targetArgs(target, ["add", "-f", "--sparse", "--pathspec-from-file=-", "--pathspec-file-nul"]), {env: indexEnv(indexPath), input: pathspecs(paths)});
}

/** Replaces the index contents with a tree. */
export async function readTree(target: GitTarget, indexPath: string, treeId: string): Promise<void> {
  await runGit(targetArgs(target, ["read-tree", treeId]), {env: indexEnv(indexPath)});
}

/** Empties the index, used when no source index could be copied. */
export async function readEmptyTree(target: GitTarget, indexPath: string): Promise<void> {
  await runGit(targetArgs(target, ["read-tree", "--empty"]), {env: indexEnv(indexPath)});
}

/** Writes the index as a tree object and returns its id. */
export async function writeTree(target: GitTarget, indexPath: string): Promise<string> {
  const treeId = (await runGit(targetArgs(target, ["write-tree"]), {env: indexEnv(indexPath)})).stdout.trim();
  if (!HASH_PATTERN.test(treeId)) throw new Error("Git returned an invalid checkpoint tree.");
  return treeId;
}

/** Lists paths that differ between two trees, without rename detection. */
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

/** Lists every path contained in a tree. */
export async function listTreePaths(target: GitTarget, treeId: string): Promise<readonly string[]> {
  const output = await runGit(targetArgs(target, ["ls-tree", "-r", "--name-only", "-z", treeId, "--"]));
  return nulRecords(output.stdout);
}

/** Writes tree content for the given paths into the worktree. */
export async function restoreWorktreePaths(target: GitTarget, indexPath: string, treeId: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  const env = indexEnv(indexPath);
  await runGit(targetArgs(target, ["read-tree", treeId]), {env});
  await runGit(targetArgs(target, ["restore", "--source", treeId, "--worktree", "--pathspec-from-file=-", "--pathspec-file-nul"]), {env, input: pathspecs(paths)});
}

/** Points a ref at an object id. */
export async function writeRef(gitDir: string, ref: string, objectId: string): Promise<void> {
  await runGit([`--git-dir=${gitDir}`, "update-ref", ref, objectId]);
}

/** Deletes a ref, ignoring a ref that is already gone. */
export async function deleteRef(gitDir: string, ref: string): Promise<void> {
  await runGitResult([`--git-dir=${gitDir}`, "update-ref", "-d", ref]);
}

/** Lists refs under a prefix. */
export async function listRefs(gitDir: string, prefix: string): Promise<readonly string[]> {
  const output = await optionalGit([`--git-dir=${gitDir}`, "for-each-ref", "--format=%(refname)", prefix]);
  return output ? output.split("\n").filter(Boolean) : [];
}

/** Resolves the tree a ref points at. */
export async function resolveRefTree(gitDir: string, ref: string): Promise<string> {
  const output = await runGit([`--git-dir=${gitDir}`, "rev-parse", `${ref}^{tree}`]);
  return output.stdout.trim();
}

/** Packs and prunes a shadow repository, ignoring failures because maintenance is best-effort. */
export async function collectGarbage(gitDir: string): Promise<void> {
  await runGitResult([`--git-dir=${gitDir}`, "gc", `--prune=${PRUNE_EXPIRY}`]);
}
