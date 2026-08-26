import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {copyFile, lstat, mkdir, mkdtemp, readdir, realpath, rm, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {basename, dirname, isAbsolute, join, relative, resolve, sep} from "node:path";

const GIT_CONFIG = ["-c", "core.autocrlf=false", "-c", "core.fsmonitor=false", "-c", "core.longpaths=true", "-c", "core.symlinks=true"];
const HASH_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MAX_GIT_OUTPUT_BYTES = 128 * 1024 * 1024;
const MAX_UNTRACKED_FILE_BYTES = 2 * 1024 * 1024;
const PRUNE_EXPIRY = "7.days";

interface GitOutput {
  readonly stderr: string;
  readonly stdout: string;
}

interface RepositoryIdentity {
  readonly gitDir: string;
  readonly objectDir: string;
  readonly objectFormat: "sha1" | "sha256";
  readonly relativeRoot: string;
  readonly repositoryId: string;
  readonly root: string;
  readonly sourceIndexPath: string;
}

export interface DiscoveredRepository extends RepositoryIdentity {
  readonly excludedRoots: readonly string[];
  readonly shadowGitDir: string;
}

export interface RepositoryCheckpointState {
  readonly refName: string;
  readonly relativeRoot: string;
  readonly repositoryId: string;
  readonly treeId: string;
}

export interface RepositoryRestorePlan {
  readonly affectedPaths: readonly string[];
  readonly deletePaths: readonly string[];
  readonly repository: DiscoveredRepository;
  readonly restorePaths: readonly string[];
  readonly safetyTreeId: string;
  readonly targetTreeId: string;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function slashPath(value: string): string {
  return value.split(sep).join("/");
}

export function checkpointRefName(sessionId: string, checkpointId: string): string {
  return `${checkpointSessionRefPrefix(sessionId)}${digest(checkpointId)}`;
}

export function checkpointSessionRefPrefix(sessionId: string): string {
  return `refs/supernova/${digest(sessionId)}/`;
}

function encodePathspecs(paths: readonly string[]): Buffer {
  return Buffer.from(`${paths.map((path) => `:(top,literal)${path}`).join("\0")}\0`);
}

function nulPaths(value: string): readonly string[] {
  return value.split("\0").filter(Boolean);
}

function isWithin(root: string, path: string): boolean {
  const relativePath = relative(root, path);
  return relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath));
}

function validateGitPath(path: string): void {
  if (path.length === 0 || isAbsolute(path) || path.includes("\0")) throw new Error("Checkpoint contains an unsafe repository path.");
  const segments = path.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) throw new Error("Checkpoint contains an unsafe repository path.");
}

async function runGitResult(
  args: readonly string[],
  options: {readonly cwd?: string; readonly env?: NodeJS.ProcessEnv; readonly input?: Buffer} = {}
): Promise<GitOutput & {readonly code: number}> {
  return new Promise((complete) => {
    const child = spawn("git", [...args], {cwd: options.cwd, env: options.env ?? process.env});
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let completed = false;

    function finish(code: number, errorMessage?: string): void {
      if (completed) return;
      completed = true;
      complete({
        code,
        stderr: errorMessage ?? Buffer.concat(stderr).toString("utf8"),
        stdout: Buffer.concat(stdout).toString("utf8"),
      });
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes <= MAX_GIT_OUTPUT_BYTES) stdout.push(chunk);
      else child.kill();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes <= MAX_GIT_OUTPUT_BYTES) stderr.push(chunk);
      else child.kill();
    });
    child.on("error", (cause) => finish(1, cause.message));
    child.on("close", (code) => finish(code ?? 1));
    child.stdin.on("error", () => undefined);
    child.stdin.end(options.input);
  });
}

async function runGit(args: readonly string[], options: {readonly cwd?: string; readonly env?: NodeJS.ProcessEnv; readonly input?: Buffer} = {}): Promise<GitOutput> {
  const output = await runGitResult(args, options);
  if (output.code !== 0) throw new Error(`Git checkpoint command failed: ${output.stderr.trim() || args.join(" ")}`);
  return output;
}

async function optionalGit(args: readonly string[], options: {readonly cwd?: string; readonly env?: NodeJS.ProcessEnv} = {}): Promise<string | undefined> {
  const output = await runGitResult(args, options);
  const value = output.stdout.trim();
  return output.code === 0 && value.length > 0 ? value : undefined;
}

function shadowArgs(repository: Pick<DiscoveredRepository, "root" | "shadowGitDir">, args: readonly string[]): readonly string[] {
  return [...GIT_CONFIG, `--git-dir=${repository.shadowGitDir}`, `--work-tree=${repository.root}`, ...args];
}

async function discoverCandidate(candidate: string, projectRoot: string): Promise<RepositoryIdentity | undefined> {
  let canonicalCandidate: string;
  try {
    canonicalCandidate = await realpath(candidate);
    if (!(await stat(canonicalCandidate)).isDirectory()) return undefined;
  } catch {
    return undefined;
  }

  const topLevel = await optionalGit(["-C", canonicalCandidate, "rev-parse", "--show-toplevel"]);
  if (!topLevel) return undefined;

  let canonicalTopLevel: string;
  try {
    canonicalTopLevel = await realpath(topLevel);
  } catch {
    return undefined;
  }
  if (canonicalTopLevel !== canonicalCandidate) return undefined;

  const [bare, gitDirValue, objectDirValue, objectFormatValue, sourceIndexPath] = await Promise.all([
    optionalGit(["-C", canonicalCandidate, "rev-parse", "--is-bare-repository"]),
    optionalGit(["-C", canonicalCandidate, "rev-parse", "--absolute-git-dir"]),
    optionalGit(["-C", canonicalCandidate, "rev-parse", "--path-format=absolute", "--git-path", "objects"]),
    optionalGit(["-C", canonicalCandidate, "rev-parse", "--show-object-format"]),
    optionalGit(["-C", canonicalCandidate, "rev-parse", "--path-format=absolute", "--git-path", "index"]),
  ]);
  if (bare !== "false" || !gitDirValue || !objectDirValue || !sourceIndexPath) return undefined;
  if (objectFormatValue !== "sha1" && objectFormatValue !== "sha256") throw new Error("Unsupported Git object format.");

  const [gitDir, objectDir] = await Promise.all([realpath(gitDirValue), realpath(objectDirValue)]);
  const gitDirMetadata = await stat(gitDir);
  const repositoryId = digest(`${canonicalCandidate}\0${gitDir}\0${gitDirMetadata.ino}`);
  const projectRelativeRoot = relative(projectRoot, canonicalCandidate);
  if (!isWithin(projectRoot, canonicalCandidate)) return undefined;

  return {
    gitDir,
    objectDir,
    objectFormat: objectFormatValue,
    relativeRoot: projectRelativeRoot === "" ? "." : slashPath(projectRelativeRoot),
    repositoryId,
    root: canonicalCandidate,
    sourceIndexPath,
  };
}

export async function discoverRepositories(projectRoot: string, repositoriesRoot: string): Promise<readonly DiscoveredRepository[]> {
  const candidates = [projectRoot];
  const children = await readdir(projectRoot, {withFileTypes: true});
  for (const child of children) if (child.isDirectory()) candidates.push(join(projectRoot, child.name));

  const discovered = (await Promise.all(candidates.map((candidate) => discoverCandidate(candidate, projectRoot)))).filter(
    (repository): repository is RepositoryIdentity => repository !== undefined
  );
  discovered.sort((left, right) => left.relativeRoot.localeCompare(right.relativeRoot));

  return discovered.map((repository) => {
    const excludedRoots = discovered
      .filter((candidate) => candidate.root !== repository.root && dirname(candidate.root) === repository.root)
      .map((candidate) => slashPath(relative(repository.root, candidate.root)));
    return {...repository, excludedRoots, shadowGitDir: join(repositoriesRoot, repository.repositoryId, "git")};
  });
}

async function ensureShadowRepository(repository: DiscoveredRepository): Promise<void> {
  await mkdir(dirname(repository.shadowGitDir), {recursive: true});
  const headPath = join(repository.shadowGitDir, "HEAD");
  let initialized = true;
  try {
    await stat(headPath);
  } catch {
    initialized = false;
    await runGit(["init", "--bare", `--object-format=${repository.objectFormat}`, repository.shadowGitDir]);
  }

  if (!initialized) {
    await runGit([`--git-dir=${repository.shadowGitDir}`, "config", "gc.pruneExpire", PRUNE_EXPIRY]);
    await runGit([`--git-dir=${repository.shadowGitDir}`, "config", "core.autocrlf", "false"]);
    await runGit([`--git-dir=${repository.shadowGitDir}`, "config", "core.fsmonitor", "false"]);
    await runGit([`--git-dir=${repository.shadowGitDir}`, "config", "core.longpaths", "true"]);
    await runGit([`--git-dir=${repository.shadowGitDir}`, "config", "core.symlinks", "true"]);
  }
  await mkdir(join(repository.shadowGitDir, "objects", "info"), {recursive: true});
  await writeFile(join(repository.shadowGitDir, "objects", "info", "alternates"), `${repository.objectDir}\n`);
}

function isExcludedPath(path: string, excludedRoots: readonly string[]): boolean {
  return excludedRoots.some((root) => path === root || path.startsWith(`${root}/`));
}

/** Parses `ls-files -v` records. A lowercase tag marks `assume-unchanged`, and `S` marks `skip-worktree`. */
function parseIndexEntries(output: string): ReadonlyArray<{readonly flagged: boolean; readonly path: string}> {
  return nulPaths(output).map((record) => ({flagged: /^(?:S|[a-z]) /.test(record), path: record.slice(2)}));
}

async function existingFilePaths(paths: readonly string[], root: string, sizeLimit?: number): Promise<readonly string[]> {
  const files: string[] = [];
  for (const path of paths) {
    if (path === ".git" || path.startsWith(".git/") || path.includes("/.git/")) continue;
    const absolutePath = join(root, ...path.split("/"));
    let metadata;
    try {
      metadata = await lstat(absolutePath);
    } catch {
      continue;
    }
    if (!metadata.isFile() && !metadata.isSymbolicLink()) continue;
    if (sizeLimit !== undefined && !metadata.isSymbolicLink() && metadata.size > sizeLimit) continue;
    files.push(path);
  }
  return files;
}

async function withTemporaryIndex<T>(run: (indexPath: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "supernova-checkpoint-"));
  try {
    return await run(join(directory, "index"));
  } finally {
    await rm(directory, {force: true, recursive: true});
  }
}

async function createSnapshotTree(repository: DiscoveredRepository): Promise<string> {
  await ensureShadowRepository(repository);

  return withTemporaryIndex(async (indexPath) => {
    let seeded = false;
    try {
      await copyFile(repository.sourceIndexPath, indexPath);
      const sourceIndexDirectory = dirname(repository.sourceIndexPath);
      const sharedIndexes = (await readdir(sourceIndexDirectory)).filter((name) => name.startsWith("sharedindex."));
      await Promise.all(sharedIndexes.map((name) => copyFile(join(sourceIndexDirectory, name), join(dirname(indexPath), name)).catch(() => undefined)));
      seeded = true;
    } catch {
      await runGit(shadowArgs(repository, ["read-tree", "--empty"]), {env: {...process.env, GIT_INDEX_FILE: indexPath}});
    }

    const env = {...process.env, GIT_INDEX_FILE: indexPath};
    if (repository.excludedRoots.length > 0) {
      await runGit(shadowArgs(repository, ["rm", "-r", "--cached", "--ignore-unmatch", "--pathspec-from-file=-", "--pathspec-file-nul"]), {
        env,
        input: encodePathspecs(repository.excludedRoots),
      });
    }

    const indexEntries = parseIndexEntries((await runGit(shadowArgs(repository, ["ls-files", "-v", "-z"]), {env})).stdout);
    const tracked = indexEntries.map((entry) => entry.path).filter((path) => !isExcludedPath(path, repository.excludedRoots));
    const flagged = indexEntries.filter((entry) => entry.flagged).map((entry) => entry.path);
    if (flagged.length > 0) {
      // Both flags hide worktree changes, and the two options cannot be combined in one call.
      const paths = Buffer.from(`${flagged.join("\0")}\0`);
      await runGit(shadowArgs(repository, ["update-index", "--no-skip-worktree", "-z", "--stdin"]), {env, input: paths});
      await runGit(shadowArgs(repository, ["update-index", "--no-assume-unchanged", "-z", "--stdin"]), {env, input: paths});
    }
    await runGitResult(shadowArgs(repository, ["update-index", "--really-refresh"]), {env});

    const headOutput = await optionalGit(["-C", repository.root, "ls-tree", "-r", "--name-only", "-z", "HEAD"]);
    const headPaths = headOutput ? nulPaths(headOutput) : [];
    let changed: readonly string[];
    if (seeded) {
      const worktreeChanges = nulPaths((await runGit(shadowArgs(repository, ["diff-files", "--name-only", "-z"]), {env})).stdout);
      const indexPaths = new Set(tracked);
      const stagedDeletions = headPaths.filter((path) => !indexPaths.has(path));
      changed = [...new Set([...worktreeChanges, ...stagedDeletions])];
    } else {
      changed = headPaths;
    }

    changed = changed.filter((path) => !isExcludedPath(path, repository.excludedRoots));
    const untracked = nulPaths((await runGit(shadowArgs(repository, ["ls-files", "--others", "--exclude-standard", "-z"]), {env})).stdout).filter(
      (path) => !isExcludedPath(path, repository.excludedRoots)
    );
    const trackedFiles = await existingFilePaths(changed, repository.root);
    const untrackedFiles = await existingFilePaths(untracked, repository.root, MAX_UNTRACKED_FILE_BYTES);

    if (changed.length > 0) {
      await runGit(shadowArgs(repository, ["update-index", "--force-remove", "-z", "--stdin"]), {
        env,
        input: Buffer.from(`${changed.join("\0")}\0`),
      });
    }
    const stagePaths = [...new Set([...trackedFiles, ...untrackedFiles])];
    if (stagePaths.length > 0) {
      await runGit(shadowArgs(repository, ["add", "-f", "--sparse", "--pathspec-from-file=-", "--pathspec-file-nul"]), {
        env,
        input: encodePathspecs(stagePaths),
      });
    }

    const treeId = (await runGit(shadowArgs(repository, ["write-tree"]), {env})).stdout.trim();
    if (!HASH_PATTERN.test(treeId)) throw new Error("Git returned an invalid checkpoint tree.");
    return treeId;
  });
}

export async function captureRepository(repository: DiscoveredRepository, sessionId: string, checkpointId: string): Promise<RepositoryCheckpointState> {
  const treeId = await createSnapshotTree(repository);
  const refName = checkpointRefName(sessionId, checkpointId);
  await runGit([`--git-dir=${repository.shadowGitDir}`, "update-ref", refName, treeId]);
  return {refName, relativeRoot: repository.relativeRoot, repositoryId: repository.repositoryId, treeId};
}

export async function deleteCheckpointRef(repository: Pick<DiscoveredRepository, "shadowGitDir">, ref: string): Promise<void> {
  await runGitResult([`--git-dir=${repository.shadowGitDir}`, "update-ref", "-d", ref]);
}

export async function verifyCheckpointRef(repository: DiscoveredRepository, state: RepositoryCheckpointState): Promise<void> {
  await ensureShadowRepository(repository);
  const resolvedTree = (await runGit([`--git-dir=${repository.shadowGitDir}`, "rev-parse", `${state.refName}^{tree}`])).stdout.trim();
  if (resolvedTree !== state.treeId) throw new Error("Checkpoint ref does not resolve to its recorded tree.");
}

async function diffTreePaths(
  repository: DiscoveredRepository,
  fromTreeId: string,
  targetTreeId: string
): Promise<{readonly deletePaths: readonly string[]; readonly restorePaths: readonly string[]}> {
  const output = await runGit(shadowArgs(repository, ["diff", "--name-status", "--no-renames", "-z", fromTreeId, targetTreeId]));
  const fields = nulPaths(output.stdout);
  const deletePaths: string[] = [];
  const restorePaths: string[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const path = fields[index + 1];
    if (!status || !path || isExcludedPath(path, repository.excludedRoots)) continue;
    validateGitPath(path);
    if (status.startsWith("D")) deletePaths.push(path);
    else restorePaths.push(path);
  }
  return {deletePaths, restorePaths};
}

async function assertNoSymlinkAncestor(repositoryRoot: string, path: string): Promise<void> {
  const segments = path.split("/");
  let current = repositoryRoot;
  for (const segment of segments.slice(0, -1)) {
    current = join(current, segment);
    let metadata;
    try {
      metadata = await lstat(current);
    } catch {
      return;
    }
    if (metadata.isSymbolicLink()) throw new Error("Checkpoint path has a symbolic-link ancestor.");
    if (!metadata.isDirectory()) return;
  }
}

async function replaceTreePathsWithWorktree(repository: DiscoveredRepository, baseTreeId: string, affectedPaths: readonly string[]): Promise<string> {
  for (const path of affectedPaths) await assertNoSymlinkAncestor(repository.root, path);

  return withTemporaryIndex(async (indexPath) => {
    const env = {...process.env, GIT_INDEX_FILE: indexPath};
    await runGit(shadowArgs(repository, ["read-tree", baseTreeId]), {env});
    if (affectedPaths.length > 0) {
      await runGit(shadowArgs(repository, ["update-index", "--force-remove", "-z", "--stdin"]), {
        env,
        input: Buffer.from(`${affectedPaths.join("\0")}\0`),
      });
    }
    const existingPaths = await existingFilePaths(affectedPaths, repository.root);
    if (existingPaths.length > 0) {
      await runGit(shadowArgs(repository, ["add", "-f", "--sparse", "--pathspec-from-file=-", "--pathspec-file-nul"]), {
        env,
        input: encodePathspecs(existingPaths),
      });
    }
    return (await runGit(shadowArgs(repository, ["write-tree"]), {env})).stdout.trim();
  });
}

/** Raised when the worktree no longer matches the current checkpoint on a path the restore would change. */
export class CheckpointConflictError extends Error {
  public constructor() {
    super("Workspace files changed after the current checkpoint.");
    this.name = "CheckpointConflictError";
  }
}

export async function buildRestorePlan(
  repository: DiscoveredRepository,
  current: RepositoryCheckpointState,
  target: RepositoryCheckpointState,
  force: boolean
): Promise<RepositoryRestorePlan> {
  const operations = await diffTreePaths(repository, current.treeId, target.treeId);
  const affectedPaths = [...new Set([...operations.deletePaths, ...operations.restorePaths])].sort();
  const safetyTreeId = await replaceTreePathsWithWorktree(repository, current.treeId, affectedPaths);
  if (safetyTreeId !== current.treeId && !force) throw new CheckpointConflictError();

  return {
    affectedPaths,
    deletePaths: operations.deletePaths,
    repository,
    restorePaths: operations.restorePaths,
    safetyTreeId,
    targetTreeId: target.treeId,
  };
}

async function containsGitMetadata(path: string): Promise<boolean> {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    return false;
  }
  if (basename(path) === ".git") return true;
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) return false;
  const children = await readdir(path);
  for (const child of children) if (await containsGitMetadata(join(path, child))) return true;
  return false;
}

function topmostPaths(paths: readonly string[]): readonly string[] {
  const ordered = [...new Set(paths)].sort((left, right) => left.split("/").length - right.split("/").length || left.localeCompare(right));
  return ordered.filter((path, index) => !ordered.slice(0, index).some((parent) => path.startsWith(`${parent}/`)));
}

async function removeWorktreePaths(repository: DiscoveredRepository, paths: readonly string[]): Promise<void> {
  for (const path of topmostPaths(paths)) {
    validateGitPath(path);
    await assertNoSymlinkAncestor(repository.root, path);
    const absolutePath = resolve(repository.root, ...path.split("/"));
    if (!isWithin(repository.root, absolutePath)) throw new Error("Checkpoint path escapes its repository.");
    if (await containsGitMetadata(absolutePath)) throw new Error("Checkpoint restore would remove nested Git metadata.");
    await rm(absolutePath, {force: true, recursive: true});
  }
}

async function treePaths(repository: DiscoveredRepository, treeId: string, candidates: readonly string[]): Promise<readonly string[]> {
  if (candidates.length === 0) return [];
  const output = await runGit(shadowArgs(repository, ["ls-tree", "-r", "--name-only", "-z", treeId, "--"]));
  const candidateSet = new Set(candidates);
  return nulPaths(output.stdout).filter((path) => candidateSet.has(path));
}

async function restoreTreePaths(repository: DiscoveredRepository, treeId: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  await withTemporaryIndex(async (indexPath) => {
    await runGit(shadowArgs(repository, ["read-tree", treeId]), {env: {...process.env, GIT_INDEX_FILE: indexPath}});
    await runGit(shadowArgs(repository, ["restore", "--source", treeId, "--worktree", "--pathspec-from-file=-", "--pathspec-file-nul"]), {
      env: {...process.env, GIT_INDEX_FILE: indexPath},
      input: encodePathspecs(paths),
    });
  });
}

async function applyTree(repository: DiscoveredRepository, treeId: string, affectedPaths: readonly string[], restorePaths: readonly string[]): Promise<void> {
  await removeWorktreePaths(repository, affectedPaths);
  await restoreTreePaths(repository, treeId, restorePaths);
}

export async function applyRestorePlan(plan: RepositoryRestorePlan): Promise<void> {
  await applyTree(plan.repository, plan.targetTreeId, plan.affectedPaths, plan.restorePaths);
  const verificationTreeId = await replaceTreePathsWithWorktree(plan.repository, plan.targetTreeId, plan.affectedPaths);
  if (verificationTreeId !== plan.targetTreeId) throw new Error("Workspace checkpoint verification failed.");
}

export async function rollbackRestorePlan(plan: RepositoryRestorePlan): Promise<void> {
  const restorePaths = await treePaths(plan.repository, plan.safetyTreeId, plan.affectedPaths);
  await applyTree(plan.repository, plan.safetyTreeId, plan.affectedPaths, restorePaths);
}

async function listDirectories(path: string): Promise<readonly string[]> {
  try {
    return (await readdir(path, {withFileTypes: true})).filter((entry) => entry.isDirectory()).map((entry) => join(path, entry.name));
  } catch {
    return [];
  }
}

export async function repositoryMatchesTree(repository: DiscoveredRepository, treeId: string): Promise<boolean> {
  return (await createSnapshotTree(repository)) === treeId;
}

export async function deleteSessionRefs(repositoriesRoot: string, sessionId: string): Promise<void> {
  const repositories = await listDirectories(repositoriesRoot);
  const prefix = checkpointSessionRefPrefix(sessionId);
  for (const repositoryPath of repositories) {
    const gitDir = join(repositoryPath, "git");
    const refs = await optionalGit([`--git-dir=${gitDir}`, "for-each-ref", "--format=%(refname)", prefix]);
    if (!refs) continue;
    for (const ref of refs.split("\n").filter(Boolean)) await runGitResult([`--git-dir=${gitDir}`, "update-ref", "-d", ref]);
  }
}

/**
 * Reclaims unreachable objects for one project's shadow repositories.
 *
 * Shadow repositories keep automatic Git maintenance enabled with a pinned prune window, so
 * this only exists to reclaim promptly after refs are deleted instead of waiting for Git's
 * loose-object heuristic.
 */
export async function collectShadowGarbage(repositoriesRoot: string): Promise<void> {
  for (const repository of await listDirectories(repositoriesRoot)) {
    await runGitResult([`--git-dir=${join(repository, "git")}`, "gc", `--prune=${PRUNE_EXPIRY}`]);
  }
}
