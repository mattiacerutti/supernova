import {copyFile, lstat, mkdir, mkdtemp, readdir, realpath, rm, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {basename, dirname, join, relative, resolve} from "node:path";
import {CheckpointConflictError} from "@supernova/contracts/services/session-runtime/procedures";
import {
  addPaths,
  clearIndexFlags,
  collectGarbage,
  createShadowRepository,
  deleteRef,
  deleteRefs,
  diffTrees,
  listFlaggedPaths,
  listRefs,
  listTreePaths,
  readEmptyTree,
  readRepositoryInfo,
  readTree,
  readWorkspaceStatus,
  removeCachedPaths,
  removeIndexPaths,
  resolveRefTree,
  restoreWorktreePaths,
  writeRef,
  writeTree,
} from "@supernova/agent-runtime/features/session-runtime/checkpoints/lib/git-commands";
import type {GitObjectFormat, GitTarget} from "@supernova/agent-runtime/features/session-runtime/checkpoints/lib/git-commands";
import {checkpointRefName, checkpointSessionRefPrefix, digest} from "@supernova/agent-runtime/features/session-runtime/checkpoints/lib/checkpoint-keys";
import {isExcludedPath, isWithin, slashPath, topmostPaths, validateGitPath} from "@supernova/agent-runtime/features/session-runtime/checkpoints/lib/git-paths";

const MAX_UNTRACKED_FILE_BYTES = 2 * 1024 * 1024;

interface RepositoryIdentity {
  readonly gitDir: string;
  readonly objectDir: string;
  readonly objectFormat: GitObjectFormat;
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

function shadowTarget(repository: DiscoveredRepository): GitTarget {
  return {gitDir: repository.shadowGitDir, worktree: repository.root};
}

async function hasGitEntry(candidate: string): Promise<boolean> {
  try {
    await lstat(join(candidate, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function discoverCandidate(candidate: string, projectRoot: string): Promise<RepositoryIdentity | undefined> {
  let canonicalCandidate: string;
  try {
    canonicalCandidate = await realpath(candidate);
    if (!(await stat(canonicalCandidate)).isDirectory()) return undefined;
  } catch {
    return undefined;
  }

  const info = await readRepositoryInfo(canonicalCandidate);
  if (!info || info.bare) return undefined;

  let canonicalTopLevel: string;
  try {
    canonicalTopLevel = await realpath(info.topLevel);
  } catch {
    return undefined;
  }
  // A directory inside a repository reports that repository's root, so only its root is a candidate.
  if (canonicalTopLevel !== canonicalCandidate) return undefined;
  if (!isWithin(projectRoot, canonicalCandidate)) return undefined;

  const [gitDir, objectDir] = await Promise.all([realpath(info.gitDir), realpath(info.objectDir)]);
  const gitDirMetadata = await stat(gitDir);
  // Some filesystems report ctime as birth time, and a .git's ctime changes constantly.
  const birthTime = gitDirMetadata.birthtimeMs === gitDirMetadata.ctimeMs ? 0 : gitDirMetadata.birthtimeMs;
  const projectRelativeRoot = relative(projectRoot, canonicalCandidate);

  return {
    gitDir,
    objectDir,
    objectFormat: info.objectFormat,
    relativeRoot: projectRelativeRoot === "" ? "." : slashPath(projectRelativeRoot),
    repositoryId: digest(`${canonicalCandidate}\0${gitDir}\0${gitDirMetadata.ino}\0${birthTime}`),
    root: canonicalCandidate,
    sourceIndexPath: info.indexPath,
  };
}

export async function discoverRepositories(projectRoot: string, repositoriesRoot: string): Promise<readonly DiscoveredRepository[]> {
  const candidates = [projectRoot];
  const children = await readdir(projectRoot, {withFileTypes: true});
  for (const child of children) if (child.isDirectory()) candidates.push(join(projectRoot, child.name));

  const repositoryCandidates = (await Promise.all(candidates.map(async (candidate) => ((await hasGitEntry(candidate)) ? candidate : undefined)))).filter(
    (candidate): candidate is string => candidate !== undefined
  );
  const discovered = (await Promise.all(repositoryCandidates.map((candidate) => discoverCandidate(candidate, projectRoot)))).filter(
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
  let initialized = true;
  try {
    await stat(join(repository.shadowGitDir, "HEAD"));
  } catch {
    initialized = false;
  }

  if (!initialized) await createShadowRepository(repository.shadowGitDir, repository.objectFormat);
  await mkdir(join(repository.shadowGitDir, "objects", "info"), {recursive: true});
  await writeFile(join(repository.shadowGitDir, "objects", "info", "alternates"), `${repository.objectDir}\n`);
}

async function existingFilePaths(paths: readonly string[], root: string, sizeLimit?: number): Promise<readonly string[]> {
  const files: string[] = [];
  for (const path of paths) {
    if (path === ".git" || path.startsWith(".git/") || path.includes("/.git/")) continue;
    let metadata;
    try {
      metadata = await lstat(join(root, ...path.split("/")));
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

async function seedIndex(repository: DiscoveredRepository, target: GitTarget, indexPath: string): Promise<void> {
  try {
    await copyFile(repository.sourceIndexPath, indexPath);
    const sourceIndexDirectory = dirname(repository.sourceIndexPath);
    const sharedIndexes = (await readdir(sourceIndexDirectory)).filter((name) => name.startsWith("sharedindex."));
    await Promise.all(sharedIndexes.map((name) => copyFile(join(sourceIndexDirectory, name), join(dirname(indexPath), name)).catch(() => undefined)));
  } catch {
    await readEmptyTree(target, indexPath);
  }
}

async function createSnapshotTree(repository: DiscoveredRepository): Promise<string> {
  await ensureShadowRepository(repository);
  const target = shadowTarget(repository);

  return withTemporaryIndex(async (indexPath) => {
    await seedIndex(repository, target, indexPath);
    await removeCachedPaths(target, indexPath, repository.excludedRoots);
    await clearIndexFlags(target, indexPath, await listFlaggedPaths(target, indexPath));

    const status = await readWorkspaceStatus(target, indexPath);
    const changed = status.changed.filter((path) => !isExcludedPath(path, repository.excludedRoots));
    const untracked = status.untracked.filter((path) => !isExcludedPath(path, repository.excludedRoots));
    const trackedFiles = await existingFilePaths(changed, repository.root);
    const untrackedFiles = await existingFilePaths(untracked, repository.root, MAX_UNTRACKED_FILE_BYTES);

    // Removing first lets a rebuilt entry represent a deletion, a mode change, or a type change.
    await removeIndexPaths(target, indexPath, changed);
    await addPaths(target, indexPath, [...new Set([...trackedFiles, ...untrackedFiles])]);

    return writeTree(target, indexPath);
  });
}

export async function captureRepository(repository: DiscoveredRepository, sessionId: string, checkpointId: string): Promise<RepositoryCheckpointState> {
  const treeId = await createSnapshotTree(repository);
  const refName = checkpointRefName(sessionId, checkpointId);
  await writeRef(repository.shadowGitDir, refName, treeId);
  return {refName, relativeRoot: repository.relativeRoot, repositoryId: repository.repositoryId, treeId};
}

export async function deleteCheckpointRef(repository: Pick<DiscoveredRepository, "shadowGitDir">, ref: string): Promise<void> {
  await deleteRef(repository.shadowGitDir, ref);
}

export async function verifyCheckpointRef(repository: DiscoveredRepository, state: RepositoryCheckpointState): Promise<void> {
  await ensureShadowRepository(repository);
  if ((await resolveRefTree(repository.shadowGitDir, state.refName)) !== state.treeId) throw new Error("Checkpoint ref does not resolve to its recorded tree.");
}

export async function repositoryMatchesTree(repository: DiscoveredRepository, treeId: string): Promise<boolean> {
  return (await createSnapshotTree(repository)) === treeId;
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
  const target = shadowTarget(repository);

  return withTemporaryIndex(async (indexPath) => {
    await readTree(target, indexPath, baseTreeId);
    await removeIndexPaths(target, indexPath, affectedPaths);
    await addPaths(target, indexPath, await existingFilePaths(affectedPaths, repository.root));
    return writeTree(target, indexPath);
  });
}

/** The safety tree differing from the current checkpoint means a manual change, which only `force` discards. */
export async function buildRestorePlan(
  repository: DiscoveredRepository,
  current: RepositoryCheckpointState,
  target: RepositoryCheckpointState,
  force: boolean
): Promise<RepositoryRestorePlan> {
  const changes = (await diffTrees(shadowTarget(repository), current.treeId, target.treeId)).filter((change) => !isExcludedPath(change.path, repository.excludedRoots));
  for (const change of changes) validateGitPath(change.path);

  const deletePaths = changes.filter((change) => change.deleted).map((change) => change.path);
  const restorePaths = changes.filter((change) => !change.deleted).map((change) => change.path);
  const affectedPaths = [...new Set([...deletePaths, ...restorePaths])].sort();
  const safetyTreeId = await replaceTreePathsWithWorktree(repository, current.treeId, affectedPaths);
  if (safetyTreeId !== current.treeId && !force) throw new CheckpointConflictError({message: "Restoring this checkpoint would discard changes made after it."});

  return {affectedPaths, deletePaths, repository, restorePaths, safetyTreeId, targetTreeId: target.treeId};
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

async function applyTree(repository: DiscoveredRepository, treeId: string, affectedPaths: readonly string[], restorePaths: readonly string[]): Promise<void> {
  await removeWorktreePaths(repository, affectedPaths);
  await withTemporaryIndex((indexPath) => restoreWorktreePaths(shadowTarget(repository), indexPath, treeId, restorePaths));
}

export async function applyRestorePlan(plan: RepositoryRestorePlan): Promise<void> {
  await applyTree(plan.repository, plan.targetTreeId, plan.affectedPaths, plan.restorePaths);
  const verificationTreeId = await replaceTreePathsWithWorktree(plan.repository, plan.targetTreeId, plan.affectedPaths);
  if (verificationTreeId !== plan.targetTreeId) throw new Error("Workspace checkpoint verification failed.");
}

export async function rollbackRestorePlan(plan: RepositoryRestorePlan): Promise<void> {
  const treePathSet = new Set(await listTreePaths(shadowTarget(plan.repository), plan.safetyTreeId));
  const restorePaths = plan.affectedPaths.filter((path) => treePathSet.has(path));
  await applyTree(plan.repository, plan.safetyTreeId, plan.affectedPaths, restorePaths);
}

async function listShadowGitDirs(repositoriesRoot: string): Promise<readonly string[]> {
  try {
    const entries = await readdir(repositoriesRoot, {withFileTypes: true});
    return entries.filter((entry) => entry.isDirectory()).map((entry) => join(repositoriesRoot, entry.name, "git"));
  } catch {
    return [];
  }
}

export async function deleteSessionRefs(repositoriesRoot: string, sessionId: string): Promise<void> {
  const prefix = checkpointSessionRefPrefix(sessionId);
  for (const gitDir of await listShadowGitDirs(repositoriesRoot)) {
    await deleteRefs(gitDir, await listRefs(gitDir, prefix));
  }
}

/** Git's auto-maintenance would get here eventually; this reclaims promptly after refs are deleted. */
export async function collectShadowGarbage(repositoriesRoot: string): Promise<void> {
  for (const gitDir of await listShadowGitDirs(repositoriesRoot)) await collectGarbage(gitDir);
}
