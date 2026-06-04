import {execFile} from "node:child_process";
import {existsSync} from "node:fs";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import {Context, Layer} from "effect";

const execFilePromise = promisify(execFile);
const CHECKPOINT_REF_BASE = "refs/supernova/checkpoints";
const GIT_CONFIG = ["-c", "core.autocrlf=false", "-c", "core.longpaths=true", "-c", "core.symlinks=true"];
const MAX_BUFFER_BYTES = 20 * 1024 * 1024;
const ZERO_SHA = "0".repeat(40);
const locks = new Map<string, Promise<void>>();

interface GitResult {
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}

interface CheckpointMetadata {
  readonly branch: string;
  readonly headSha: string;
  readonly indexTreeSha: string;
  readonly preexistingUntrackedFiles: readonly string[];
  readonly worktreeTreeSha: string;
}

export interface SessionCheckpointStoreShape {
  readonly create: (input: {readonly checkpointId: string; readonly cwd: string; readonly sessionId: string}) => Promise<boolean>;
  readonly restore: (input: {readonly checkpointId: string; readonly cwd: string; readonly fromCheckpointId?: string; readonly sessionId: string}) => Promise<void>;
}

/** Private workspace checkpoint capability owned by the Pi session runtime. */
export class SessionCheckpointStore extends Context.Service<SessionCheckpointStore, SessionCheckpointStoreShape>()("supernova/agent-runtime/SessionCheckpointStore") {}

async function runGit(args: readonly string[], options: {readonly cwd?: string; readonly env?: NodeJS.ProcessEnv} = {}): Promise<GitResult> {
  try {
    const result = await execFilePromise("git", [...args], {cwd: options.cwd, encoding: "utf8", env: options.env, maxBuffer: MAX_BUFFER_BYTES});
    return {code: 0, stderr: result.stderr, stdout: result.stdout};
  } catch (cause) {
    const error = cause as {readonly code?: number; readonly stderr?: string; readonly stdout?: string};
    return {code: typeof error.code === "number" ? error.code : 1, stderr: error.stderr ?? "", stdout: error.stdout ?? ""};
  }
}

async function withRepoLock<T>(repoRoot: string, run: () => Promise<T>): Promise<T> {
  const previous = locks.get(repoRoot) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => current);
  locks.set(repoRoot, queued);

  await previous.catch(() => undefined);
  try {
    return await run();
  } finally {
    release();
    if (locks.get(repoRoot) === queued) locks.delete(repoRoot);
  }
}

function checkpointRef(input: {readonly checkpointId: string; readonly sessionId: string}): string {
  return `${CHECKPOINT_REF_BASE}/${input.sessionId}/${input.checkpointId}`;
}

function metadataValue(message: string, key: string): string | undefined {
  return message.match(new RegExp(`^${key} (.+)$`, "m"))?.[1]?.trim();
}

function parseJsonList(value: string | undefined): readonly string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function repoRoot(cwd: string): Promise<string | undefined> {
  if (!existsSync(cwd)) return undefined;

  const result = await runGit(["rev-parse", "--show-toplevel"], {cwd});
  const root = result.stdout.trim();
  return result.code === 0 && root.length > 0 ? root : undefined;
}

async function readHeadSha(root: string): Promise<string> {
  const result = await runGit(["rev-parse", "HEAD"], {cwd: root});
  const head = result.stdout.trim();
  return result.code === 0 && head.length > 0 ? head : ZERO_SHA;
}

async function readBranch(root: string): Promise<string> {
  const result = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], {cwd: root});
  const branch = result.stdout.trim();
  return result.code === 0 && branch.length > 0 ? branch : "unknown";
}

async function listPreexistingUntrackedFiles(root: string): Promise<readonly string[]> {
  const result = await runGit(["ls-files", "--others", "--exclude-standard"], {cwd: root});
  if (result.code !== 0) return [];
  return result.stdout
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);
}

async function writeCheckpointCommit(input: {
  readonly branch: string;
  readonly checkpointId: string;
  readonly headSha: string;
  readonly indexTreeSha: string;
  readonly preexistingUntrackedFiles: readonly string[];
  readonly root: string;
  readonly sessionId: string;
  readonly worktreeTreeSha: string;
}): Promise<string | undefined> {
  const created = new Date().toISOString();
  const message = [
    "supernova-checkpoint",
    `sessionId ${input.sessionId}`,
    `checkpointId ${input.checkpointId}`,
    `branch ${input.branch}`,
    `head ${input.headSha}`,
    `index-tree ${input.indexTreeSha}`,
    `worktree-tree ${input.worktreeTreeSha}`,
    `created ${created}`,
    `untracked ${JSON.stringify(input.preexistingUntrackedFiles)}`,
  ].join("\n");

  const result = await runGit(["commit-tree", input.worktreeTreeSha, "-m", message], {
    cwd: input.root,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: created,
      GIT_AUTHOR_EMAIL: "checkpoints@supernova.local",
      GIT_AUTHOR_NAME: "Supernova",
      GIT_COMMITTER_DATE: created,
      GIT_COMMITTER_EMAIL: "checkpoints@supernova.local",
      GIT_COMMITTER_NAME: "Supernova",
    },
  });
  const commit = result.stdout.trim();
  return result.code === 0 && commit.length > 0 ? commit : undefined;
}

async function loadCheckpointMetadata(input: {readonly checkpointId: string; readonly root: string; readonly sessionId: string}): Promise<CheckpointMetadata | undefined> {
  const commit = await runGit(["rev-parse", "--verify", checkpointRef(input)], {cwd: input.root});
  if (commit.code !== 0) return undefined;

  const message = await runGit(["cat-file", "commit", commit.stdout.trim()], {cwd: input.root});
  if (message.code !== 0) return undefined;

  const headSha = metadataValue(message.stdout, "head");
  const indexTreeSha = metadataValue(message.stdout, "index-tree");
  const worktreeTreeSha = metadataValue(message.stdout, "worktree-tree");
  if (!headSha || !indexTreeSha || !worktreeTreeSha) return undefined;

  return {
    branch: metadataValue(message.stdout, "branch") ?? "unknown",
    headSha,
    indexTreeSha,
    preexistingUntrackedFiles: parseJsonList(metadataValue(message.stdout, "untracked")),
    worktreeTreeSha,
  };
}

async function create(input: {readonly checkpointId: string; readonly cwd: string; readonly sessionId: string}): Promise<boolean> {
  const root = await repoRoot(input.cwd);
  if (!root) return false;

  return withRepoLock(root, async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "supernova-checkpoint-"));
    const tempIndex = join(tempDir, "index");

    try {
      const headSha = await readHeadSha(root);
      const branch = await readBranch(root);
      const indexTree = await runGit([...GIT_CONFIG, "write-tree"], {cwd: root});
      if (indexTree.code !== 0) return false;

      const env = {...process.env, GIT_INDEX_FILE: tempIndex};
      if (headSha !== ZERO_SHA) await runGit([...GIT_CONFIG, "read-tree", headSha], {cwd: root, env});

      await runGit([...GIT_CONFIG, "add", "--all", "--", "."], {cwd: root, env});
      const worktreeTree = await runGit([...GIT_CONFIG, "write-tree"], {cwd: root, env});
      if (worktreeTree.code !== 0) return false;

      const commit = await writeCheckpointCommit({
        branch,
        checkpointId: input.checkpointId,
        headSha,
        indexTreeSha: indexTree.stdout.trim(),
        preexistingUntrackedFiles: await listPreexistingUntrackedFiles(root),
        root,
        sessionId: input.sessionId,
        worktreeTreeSha: worktreeTree.stdout.trim(),
      });
      if (!commit) return false;

      const update = await runGit(["update-ref", checkpointRef(input), commit], {cwd: root});
      return update.code === 0;
    } finally {
      await rm(tempDir, {force: true, recursive: true}).catch(() => undefined);
    }
  });
}

/** Parses NUL-delimited name-status output and includes both sides of renames/copies. */
function parseChangedPaths(output: string): readonly string[] {
  const entries = output.split("\0").filter(Boolean);
  const paths = new Set<string>();

  for (let index = 0; index < entries.length; index += 1) {
    const status = entries[index];
    if (!status) continue;

    if (status.startsWith("R") || status.startsWith("C")) {
      const oldPath = entries[index + 1];
      const newPath = entries[index + 2];
      if (oldPath) paths.add(oldPath);
      if (newPath) paths.add(newPath);
      index += 2;
      continue;
    }

    const filePath = entries[index + 1];
    if (filePath) paths.add(filePath);
    index += 1;
  }

  return [...paths];
}

/** Lists paths that changed between two checkpoint worktree trees. */
async function changedPathsBetweenTrees(input: {readonly fromTreeSha: string; readonly root: string; readonly toTreeSha: string}): Promise<readonly string[]> {
  const result = await runGit(["diff", "--name-status", "-z", input.fromTreeSha, input.toTreeSha], {cwd: input.root});
  return result.code === 0 ? parseChangedPaths(result.stdout) : [];
}

/** Returns whether a tree contains the given repository-relative path. */
async function treeHasPath(input: {readonly path: string; readonly root: string; readonly treeSha: string}): Promise<boolean> {
  const result = await runGit(["cat-file", "-e", `${input.treeSha}:${input.path}`], {cwd: input.root});
  return result.code === 0;
}

/** Restores a single path from a tree into the worktree, or deletes it if absent from the tree. */
async function restoreChangedPath(input: {readonly path: string; readonly root: string; readonly treeSha: string}): Promise<void> {
  if (await treeHasPath(input)) {
    await runGit([...GIT_CONFIG, "restore", "--source", input.treeSha, "--worktree", "--", input.path], {cwd: input.root});
    return;
  }

  await rm(join(input.root, input.path), {force: true, recursive: true}).catch(() => undefined);
}

/** Captures the current worktree into an isolated temporary index without mutating the user's index. */
async function currentWorktreeTree(root: string): Promise<string | undefined> {
  const tempDir = await mkdtemp(join(tmpdir(), "supernova-checkpoint-restore-"));
  const tempIndex = join(tempDir, "index");

  try {
    const headSha = await readHeadSha(root);
    const env = {...process.env, GIT_INDEX_FILE: tempIndex};
    if (headSha !== ZERO_SHA) await runGit([...GIT_CONFIG, "read-tree", headSha], {cwd: root, env});
    await runGit([...GIT_CONFIG, "add", "--all", "--", "."], {cwd: root, env});
    const worktreeTree = await runGit([...GIT_CONFIG, "write-tree"], {cwd: root, env});
    return worktreeTree.code === 0 ? worktreeTree.stdout.trim() : undefined;
  } finally {
    await rm(tempDir, {force: true, recursive: true}).catch(() => undefined);
  }
}

async function restore(input: {readonly checkpointId: string; readonly cwd: string; readonly fromCheckpointId?: string; readonly sessionId: string}): Promise<void> {
  const root = await repoRoot(input.cwd);
  if (!root) return;

  await withRepoLock(root, async () => {
    const checkpoint = await loadCheckpointMetadata({checkpointId: input.checkpointId, root, sessionId: input.sessionId});
    if (!checkpoint) return;

    const currentBranch = await readBranch(root);
    if (checkpoint.branch !== "unknown" && currentBranch !== checkpoint.branch)
      throw new Error(`Checkpoint was created on "${checkpoint.branch}" but current branch is "${currentBranch}".`);

    const fromCheckpoint = input.fromCheckpointId
      ? await loadCheckpointMetadata({checkpointId: input.fromCheckpointId, root, sessionId: input.sessionId})
      : undefined;
    const fromTreeSha = fromCheckpoint?.worktreeTreeSha ?? (await currentWorktreeTree(root));
    if (!fromTreeSha) return;

    const changedPaths = await changedPathsBetweenTrees({fromTreeSha, root, toTreeSha: checkpoint.worktreeTreeSha});
    for (const path of changedPaths) await restoreChangedPath({path, root, treeSha: checkpoint.worktreeTreeSha});
  });
}

export const SessionCheckpointStoreLive = Layer.succeed(SessionCheckpointStore, {create, restore} satisfies SessionCheckpointStoreShape);
