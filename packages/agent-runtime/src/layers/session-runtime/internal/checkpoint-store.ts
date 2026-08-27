import {randomUUID} from "node:crypto";
import {mkdir, readFile, realpath, rename, rm, stat, writeFile} from "node:fs/promises";
import {homedir} from "node:os";
import {dirname, isAbsolute, join, resolve} from "node:path";
import {Context, Layer} from "effect";
import {KeyedMutex} from "@supernova/agent-runtime/layers/shared/lib/keyed-mutex";
import {
  applyRestorePlan,
  buildRestorePlan,
  captureRepository,
  collectShadowGarbage,
  deleteCheckpointRef,
  deleteSessionRefs,
  discoverRepositories,
  repositoryMatchesTree,
  rollbackRestorePlan,
  verifyCheckpointRef,
} from "@supernova/agent-runtime/layers/session-runtime/internal/shadow-repository";
import type {RepositoryCheckpointState, RepositoryRestorePlan} from "@supernova/agent-runtime/layers/session-runtime/internal/shadow-repository";
import {checkpointRefName, digest} from "@supernova/agent-runtime/layers/session-runtime/lib/checkpoints/checkpoint-keys";
import {isWithin} from "@supernova/agent-runtime/layers/session-runtime/lib/checkpoints/git-paths";

const HASH_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const REPOSITORY_ID_PATTERN = /^[0-9a-f]{64}$/;
const MANIFEST_VERSION = 1;

interface WorkspaceCheckpointManifest {
  readonly checkpointId: string;
  readonly projectRoot: string;
  readonly repositories: readonly RepositoryCheckpointState[];
  readonly sessionId: string;
  readonly version: 1;
}

export interface CheckpointStoreShape {
  readonly capture: (input: {readonly checkpointId: string; readonly projectRoot: string; readonly sessionId: string}) => Promise<void>;
  readonly deleteSession: (input: {readonly projectRoot: string; readonly sessionId: string}) => Promise<void>;
  readonly restore: (input: {
    readonly checkpointId: string;
    readonly force: boolean;
    readonly fromCheckpointId: string;
    readonly projectRoot: string;
    readonly sessionId: string;
  }) => Promise<void>;
}

/** Owns durable checkpoint manifests and coordinates app-private shadow repositories. */
export class CheckpointStore extends Context.Service<CheckpointStore, CheckpointStoreShape>()("supernova/agent-runtime/CheckpointStore") {}

function repositoryKey(state: Pick<RepositoryCheckpointState, "relativeRoot" | "repositoryId">): string {
  return `${state.repositoryId}\0${state.relativeRoot}`;
}

function validateRelativeRoot(projectRoot: string, relativeRoot: unknown): string {
  if (typeof relativeRoot !== "string") throw new Error("Checkpoint manifest contains an invalid repository root.");
  if (relativeRoot === ".") return relativeRoot;
  if (relativeRoot.length === 0 || isAbsolute(relativeRoot) || relativeRoot.includes("\0")) throw new Error("Checkpoint manifest contains an invalid repository root.");
  const segments = relativeRoot.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) throw new Error("Checkpoint manifest contains an invalid repository root.");
  const absoluteRoot = resolve(projectRoot, ...segments);
  if (!isWithin(projectRoot, absoluteRoot)) throw new Error("Checkpoint repository root escapes its project.");
  return relativeRoot;
}

async function canonicalProjectRoot(projectRoot: string): Promise<string> {
  const canonical = await realpath(resolve(projectRoot));
  if (!(await stat(canonical)).isDirectory()) throw new Error("Checkpoint project root is not a directory.");
  return canonical;
}

function defaultStorageRoot(): string {
  const agentDataRoot = process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".supernova", "userdata", "agent");
  return join(resolve(agentDataRoot), "checkpoints");
}

function projectStorageRoot(storageRoot: string, projectRoot: string): string {
  return join(storageRoot, "projects", digest(projectRoot));
}

function manifestPath(projectStorage: string, sessionId: string, checkpointId: string): string {
  return join(projectStorage, "manifests", digest(sessionId), `${digest(checkpointId)}.json`);
}

async function writeManifest(path: string, manifest: WorkspaceCheckpointManifest): Promise<void> {
  await mkdir(dirname(path), {recursive: true});
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {flag: "wx"});
  try {
    await rename(temporaryPath, path);
  } catch (cause) {
    await rm(temporaryPath, {force: true});
    throw cause;
  }
}

function parseManifest(value: unknown, expected: {readonly checkpointId: string; readonly projectRoot: string; readonly sessionId: string}): WorkspaceCheckpointManifest {
  if (typeof value !== "object" || value === null) throw new Error("Checkpoint manifest is invalid.");
  const record = value as Record<string, unknown>;
  if (
    record.version !== MANIFEST_VERSION ||
    record.checkpointId !== expected.checkpointId ||
    record.sessionId !== expected.sessionId ||
    record.projectRoot !== expected.projectRoot
  ) {
    throw new Error("Checkpoint manifest ownership is invalid.");
  }
  if (!Array.isArray(record.repositories)) throw new Error("Checkpoint manifest repository list is invalid.");

  const ids = new Set<string>();
  const roots = new Set<string>();
  const expectedRef = checkpointRefName(expected.sessionId, expected.checkpointId);
  const repositories = record.repositories.map((value): RepositoryCheckpointState => {
    if (typeof value !== "object" || value === null) throw new Error("Checkpoint repository state is invalid.");
    const repository = value as Record<string, unknown>;
    const relativeRoot = validateRelativeRoot(expected.projectRoot, repository.relativeRoot);
    if (typeof repository.repositoryId !== "string" || !REPOSITORY_ID_PATTERN.test(repository.repositoryId)) throw new Error("Checkpoint repository identity is invalid.");
    if (typeof repository.treeId !== "string" || !HASH_PATTERN.test(repository.treeId)) throw new Error("Checkpoint tree identity is invalid.");
    if (repository.refName !== expectedRef) throw new Error("Checkpoint ref ownership is invalid.");
    if (ids.has(repository.repositoryId) || roots.has(relativeRoot)) throw new Error("Checkpoint manifest contains duplicate repositories.");
    ids.add(repository.repositoryId);
    roots.add(relativeRoot);
    return {refName: expectedRef, relativeRoot, repositoryId: repository.repositoryId, treeId: repository.treeId};
  });

  return {
    checkpointId: expected.checkpointId,
    projectRoot: expected.projectRoot,
    repositories,
    sessionId: expected.sessionId,
    version: MANIFEST_VERSION,
  };
}

async function loadManifest(
  projectStorage: string,
  expected: {readonly checkpointId: string; readonly projectRoot: string; readonly sessionId: string}
): Promise<WorkspaceCheckpointManifest> {
  const contents = await readFile(manifestPath(projectStorage, expected.sessionId, expected.checkpointId), "utf8");
  return parseManifest(JSON.parse(contents), expected);
}

class CheckpointStoreImpl implements CheckpointStoreShape {
  private readonly projectLocks = new KeyedMutex<string>();
  private readonly storageRoot: string;

  public constructor(storageRoot?: string) {
    this.storageRoot = resolve(storageRoot ?? defaultStorageRoot());
  }

  public async capture(input: {readonly checkpointId: string; readonly projectRoot: string; readonly sessionId: string}): Promise<void> {
    const projectRoot = await canonicalProjectRoot(input.projectRoot);
    await this.projectLocks.withLock(projectRoot, () => this.captureProject(projectRoot, input));
  }

  public async restore(input: {
    readonly checkpointId: string;
    readonly force: boolean;
    readonly fromCheckpointId: string;
    readonly projectRoot: string;
    readonly sessionId: string;
  }): Promise<void> {
    const projectRoot = await canonicalProjectRoot(input.projectRoot);
    await this.projectLocks.withLock(projectRoot, () => this.restoreProject(projectRoot, input));
  }

  public async deleteSession(input: {readonly projectRoot: string; readonly sessionId: string}): Promise<void> {
    try {
      const projectRoot = await canonicalProjectRoot(input.projectRoot);
      const projectStorage = projectStorageRoot(this.storageRoot, projectRoot);
      const repositoriesRoot = join(projectStorage, "repositories");
      await deleteSessionRefs(repositoriesRoot, input.sessionId);
      await rm(join(projectStorage, "manifests", digest(input.sessionId)), {force: true, recursive: true});
      await collectShadowGarbage(repositoriesRoot);
    } catch {
      return;
    }
  }

  /** Captures every discovered repository and publishes the manifest. Requires the project lock. */
  private async captureProject(projectRoot: string, input: {readonly checkpointId: string; readonly sessionId: string}): Promise<void> {
    const projectStorage = projectStorageRoot(this.storageRoot, projectRoot);
    const repositoriesRoot = join(projectStorage, "repositories");
    const repositories = await discoverRepositories(projectRoot, repositoriesRoot);

    // Repositories own separate shadow storage and temporary indexes, so they capture concurrently.
    const results = await Promise.allSettled(repositories.map((repository) => captureRepository(repository, input.sessionId, input.checkpointId)));
    const captured = repositories.flatMap((repository, index) => {
      const result = results[index];
      return result?.status === "fulfilled" ? [{repository, state: result.value}] : [];
    });

    try {
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected) throw rejected.reason;

      await writeManifest(manifestPath(projectStorage, input.sessionId, input.checkpointId), {
        checkpointId: input.checkpointId,
        projectRoot,
        repositories: captured.map(({state}) => state),
        sessionId: input.sessionId,
        version: MANIFEST_VERSION,
      });
    } catch (cause) {
      await Promise.all(captured.map(({repository, state}) => deleteCheckpointRef(repository, state.refName)));
      throw cause;
    }
  }

  /** Reconciles manifests and applies the workspace restore. Requires the project lock. */
  private async restoreProject(
    projectRoot: string,
    input: {readonly checkpointId: string; readonly force: boolean; readonly fromCheckpointId: string; readonly sessionId: string}
  ): Promise<void> {
    const projectStorage = projectStorageRoot(this.storageRoot, projectRoot);
    const repositoriesRoot = join(projectStorage, "repositories");
    const [currentManifest, targetManifest, repositories] = await Promise.all([
      loadManifest(projectStorage, {checkpointId: input.fromCheckpointId, projectRoot, sessionId: input.sessionId}),
      loadManifest(projectStorage, {checkpointId: input.checkpointId, projectRoot, sessionId: input.sessionId}),
      discoverRepositories(projectRoot, repositoriesRoot),
    ]);
    const discoveredByKey = new Map(repositories.map((repository) => [repositoryKey(repository), repository]));
    const currentByKey = new Map(currentManifest.repositories.map((state) => [repositoryKey(state), state]));
    const targetByKey = new Map(targetManifest.repositories.map((state) => [repositoryKey(state), state]));
    const plans: RepositoryRestorePlan[] = [];

    for (const state of [...currentManifest.repositories, ...targetManifest.repositories]) {
      const repository = discoveredByKey.get(repositoryKey(state));
      if (repository) await verifyCheckpointRef(repository, state);
      else if (targetByKey.has(repositoryKey(state))) throw new Error("A repository required by the checkpoint is missing or was replaced.");
    }

    for (const [key, target] of targetByKey) {
      const repository = discoveredByKey.get(key);
      if (!repository) throw new Error("A repository required by the checkpoint is missing or was replaced.");
      const current = currentByKey.get(key);
      if (!current) {
        if (!(await repositoryMatchesTree(repository, target.treeId))) throw new Error("A target-only repository does not match its checkpoint.");
        continue;
      }
      plans.push(await buildRestorePlan(repository, current, target, input.force));
    }

    const touched: RepositoryRestorePlan[] = [];
    try {
      for (const plan of plans) {
        touched.push(plan);
        await applyRestorePlan(plan);
      }
    } catch (cause) {
      for (const plan of touched.toReversed()) await rollbackRestorePlan(plan).catch(() => undefined);
      throw cause;
    }
  }
}

export function makeCheckpointStoreLive(storageRoot?: string) {
  return Layer.succeed(CheckpointStore, new CheckpointStoreImpl(storageRoot));
}

export const CheckpointStoreLive = makeCheckpointStoreLive();
