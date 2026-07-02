import {execFile, spawn} from "node:child_process";
import {existsSync} from "node:fs";
import {mkdir, rm} from "node:fs/promises";
import {dirname, join} from "node:path";
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
  readonly worktreeTreeSha: string;
}

export interface SessionCheckpointStoreShape {
  readonly create: (input: {readonly checkpointId: string; readonly cwd: string; readonly sessionId: string}) => Promise<boolean>;
  readonly restore: (input: {readonly checkpointId: string; readonly cwd: string; readonly fromCheckpointId: string; readonly sessionId: string}) => Promise<void>;
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

async function runGitWithInput(args: readonly string[], options: {readonly cwd?: string; readonly env?: NodeJS.ProcessEnv; readonly stdin: string}): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = spawn("git", [...args], {cwd: options.cwd, env: options.env});
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes <= MAX_BUFFER_BYTES) stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes <= MAX_BUFFER_BYTES) stderr.push(chunk);
    });
    child.on("error", (cause) => resolve({code: 1, stderr: cause.message, stdout: ""}));
    child.on("close", (code) => resolve({code: code ?? 1, stderr: Buffer.concat(stderr).toString("utf8"), stdout: Buffer.concat(stdout).toString("utf8")}));
    child.stdin.end(options.stdin);
  });
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

function encodeLiteralPathspecs(paths: readonly string[]): string {
  return paths.map((path) => `:(top,literal)${path}`).join("\0") + "\0";
}

async function listSnapshotCandidates(input: {readonly env: NodeJS.ProcessEnv; readonly root: string}): Promise<readonly string[]> {
  const [tracked, untracked] = await Promise.all([
    runGit([...GIT_CONFIG, "diff-files", "--name-only", "-z", "--", "."], {cwd: input.root, env: input.env}),
    runGit([...GIT_CONFIG, "ls-files", "--others", "--exclude-standard", "-z", "--", "."], {cwd: input.root, env: input.env}),
  ]);
  if (tracked.code !== 0 || untracked.code !== 0) return [];
  return [...new Set([...tracked.stdout.split("\0").filter(Boolean), ...untracked.stdout.split("\0").filter(Boolean)])];
}

async function stageSnapshotCandidates(input: {readonly candidates: readonly string[]; readonly env: NodeJS.ProcessEnv; readonly root: string}): Promise<boolean> {
  if (input.candidates.length === 0) return true;

  const result = await runGitWithInput([...GIT_CONFIG, "add", "--all", "--sparse", "--pathspec-from-file=-", "--pathspec-file-nul"], {
    cwd: input.root,
    env: input.env,
    stdin: encodeLiteralPathspecs(input.candidates),
  });
  return result.code === 0;
}

async function writeCheckpointCommit(input: {
  readonly checkpointId: string;
  readonly root: string;
  readonly sessionId: string;
  readonly worktreeTreeSha: string;
}): Promise<string | undefined> {
  const created = new Date().toISOString();
  const message = [
    "supernova-checkpoint",
    `sessionId ${input.sessionId}`,
    `checkpointId ${input.checkpointId}`,
    `worktree-tree ${input.worktreeTreeSha}`,
    `created ${created}`,
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

  const worktreeTreeSha = metadataValue(message.stdout, "worktree-tree");
  if (!worktreeTreeSha) return undefined;

  return {worktreeTreeSha};
}

async function create(input: {readonly checkpointId: string; readonly cwd: string; readonly sessionId: string}): Promise<boolean> {
  const root = await repoRoot(input.cwd);
  if (!root) return false;

  return withRepoLock(root, async () => {
    const indexPathResult = await runGit(["rev-parse", "--path-format=absolute", "--git-path", "supernova/checkpoints/index"], {cwd: root});
    const indexPath = indexPathResult.stdout.trim();
    if (indexPathResult.code !== 0 || indexPath.length === 0) return false;

    const headSha = await readHeadSha(root);
    await mkdir(dirname(indexPath), {recursive: true});
    const env = {...process.env, GIT_INDEX_FILE: indexPath};
    if (!existsSync(indexPath) && headSha !== ZERO_SHA) await runGit([...GIT_CONFIG, "read-tree", headSha], {cwd: root, env});

    const candidates = await listSnapshotCandidates({env, root});
    if (!(await stageSnapshotCandidates({candidates, env, root}))) return false;

    const worktreeTree = await runGit([...GIT_CONFIG, "write-tree"], {cwd: root, env});
    if (worktreeTree.code !== 0) return false;

    const commit = await writeCheckpointCommit({
      checkpointId: input.checkpointId,
      root,
      sessionId: input.sessionId,
      worktreeTreeSha: worktreeTree.stdout.trim(),
    });
    if (!commit) return false;

    const update = await runGit(["update-ref", checkpointRef(input), commit], {cwd: root});
    return update.code === 0;
  });
}

async function changedPathOperations(input: {readonly fromTreeSha: string; readonly root: string; readonly toTreeSha: string}) {
  const result = await runGit(["diff", "--name-status", "--no-renames", "-z", input.fromTreeSha, input.toTreeSha], {cwd: input.root});
  const deletePaths = new Set<string>();
  const restorePaths = new Set<string>();
  const entries = result.code === 0 ? result.stdout.split("\0").filter(Boolean) : [];

  for (let index = 0; index < entries.length; index += 2) {
    const status = entries[index];
    const filePath = entries[index + 1];
    if (!status || !filePath) continue;
    if (status.startsWith("D")) deletePaths.add(filePath);
    else restorePaths.add(filePath);
  }

  return {deletePaths: [...deletePaths], restorePaths: [...restorePaths]};
}

async function restore(input: {readonly checkpointId: string; readonly cwd: string; readonly fromCheckpointId: string; readonly sessionId: string}): Promise<void> {
  const root = await repoRoot(input.cwd);
  if (!root) return;

  await withRepoLock(root, async () => {
    const checkpoint = await loadCheckpointMetadata({checkpointId: input.checkpointId, root, sessionId: input.sessionId});
    if (!checkpoint) return;

    const fromCheckpoint = await loadCheckpointMetadata({checkpointId: input.fromCheckpointId, root, sessionId: input.sessionId});
    if (!fromCheckpoint) return;

    const operations = await changedPathOperations({fromTreeSha: fromCheckpoint.worktreeTreeSha, root, toTreeSha: checkpoint.worktreeTreeSha});
    if (operations.restorePaths.length > 0)
      await runGitWithInput([...GIT_CONFIG, "restore", "--source", checkpoint.worktreeTreeSha, "--worktree", "--pathspec-from-file=-", "--pathspec-file-nul"], {
        cwd: root,
        stdin: encodeLiteralPathspecs(operations.restorePaths),
      });
    for (const path of operations.deletePaths) await rm(join(root, path), {force: true, recursive: true}).catch(() => undefined);
  });
}

export const SessionCheckpointStoreLive = Layer.succeed(SessionCheckpointStore, {create, restore} satisfies SessionCheckpointStoreShape);
