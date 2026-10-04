import {execFile} from "node:child_process";
import {existsSync} from "node:fs";
import {mkdtemp, realpath, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import type {CreateSessionPayload} from "@supernova/contracts/services/sessions/procedures";
import {afterEach, describe, expect, it} from "vitest";
import {Worktrees} from "@supernova/agent-runtime/features/worktrees/worktrees";
import {createSession as createSessionOperation} from "@supernova/agent-runtime/session-operations";
import type {AgentRuntime} from "@supernova/agent-runtime/runtime";
import {cleanupTempDirs} from "@tests/support/async";
import {assistantTexts, createPiTestRuntime, fauxAssistantMessage, selectedModelReference, turnContents} from "@tests/support/session-runtime";

const firstMessage = {contentParts: [{text: "Hi", type: "text" as const}], modelReference: selectedModelReference};

const exec = promisify(execFile);
const gitEnv = {...process.env, GIT_AUTHOR_NAME: "Ada", GIT_AUTHOR_EMAIL: "a@x", GIT_COMMITTER_NAME: "Ada", GIT_COMMITTER_EMAIL: "a@x"};

async function createRepo(tempDirs: string[]): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "supernova-workflow-repo-"));
  tempDirs.push(repo);
  await exec("git", ["init", "-q", "-b", "main"], {cwd: repo, env: gitEnv});
  await writeFile(join(repo, "a.txt"), "a\n");
  await exec("git", ["add", "-A"], {cwd: repo, env: gitEnv});
  await exec("git", ["commit", "-q", "-m", "first"], {cwd: repo, env: gitEnv});
  return realpath(repo);
}

describe("creating a session with its first turn", () => {
  const runtimes: Array<{unregister: () => Promise<void>}> = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (runtimes.length > 0) await runtimes.pop()?.unregister();
    cleanupTempDirs(tempDirs);
  });

  /** Runs the workflow over a test runtime whose sessions live on disk and are reopened by the worker, as in production. */
  async function setup() {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const worktreeStorage = await mkdtemp(join(tmpdir(), "supernova-workflow-worktrees-"));
    tempDirs.push(worktreeStorage);
    // Only the features createSession orchestrates are real; the rest are never reached.
    const runtime = {sessionRuntime: pi.sessionRuntime, sessions: pi.sessions, worktrees: new Worktrees(worktreeStorage)} as AgentRuntime;
    const createSession = (payload: CreateSessionPayload) => createSessionOperation(runtime, payload);
    return {createSession, pi};
  }

  it("creates the session and starts its first turn in one call", async () => {
    const {createSession, pi} = await setup();
    pi.faux.setResponses([fauxAssistantMessage("Hello!")]);

    const created = await createSession({id: "first-send", message: firstMessage, projectPath: "/workspace"});
    await pi.settled("first-send");

    // The reply already holds the first turn, so the client's document starts at the turn.
    expect(turnContents(created)).toEqual([firstMessage.contentParts]);
    expect(assistantTexts(await pi.sessions.get({sessionId: "first-send"}))).toEqual(["Hello!"]);
  });

  it("removes the session again when its first turn cannot start", async () => {
    const {createSession, pi} = await setup();
    const unknownModel = {...selectedModelReference, id: "missing-model"};

    await expect(createSession({id: "doomed", message: {...firstMessage, modelReference: unknownModel}, projectPath: "/workspace"})).rejects.toMatchObject({
      _tag: "CreateSessionError",
    });

    expect(await pi.store.find("doomed")).toBeUndefined();
    expect(existsSync(join(pi.sessionStorageRoot, "doomed"))).toBe(false);
  });

  it("creates the session in a new worktree, reporting the setup step before the first turn", async () => {
    const {createSession, pi} = await setup();
    const repo = await createRepo(tempDirs);
    pi.faux.setResponses([fauxAssistantMessage("Hello!")]);

    const setupSteps: Array<string | null> = [];
    const stop = pi.sessionRuntime.board.state.subscribe((value) => {
      const entry = value.sessions["in-worktree"];
      if (entry && entry.setupStep !== setupSteps.at(-1)) setupSteps.push(entry.setupStep);
    });
    try {
      await createSession({id: "in-worktree", message: firstMessage, projectPath: repo, workspace: {baseRef: "main", mode: "worktree"}});
      await pi.settled("in-worktree");
    } finally {
      stop();
    }

    const session = await pi.sessions.get({sessionId: "in-worktree"});
    expect(session).toMatchObject({projectPath: repo, title: "Generated title", worktree: {branch: expect.stringMatching(/^supernova\/[a-z]+-[a-z]+$/)}});
    const worktreePath = session.worktree?.path;
    expect(worktreePath && existsSync(join(worktreePath, "a.txt"))).toBe(true);
    expect(await pi.store.cwd("in-worktree")).toBe(worktreePath);
    // Shown while the worktree is set up, cleared before the first turn.
    expect(setupSteps).toEqual(["worktree", null]);
  });

  it("removes the worktree and its branch again when the first turn cannot start", async () => {
    const {createSession, pi} = await setup();
    const repo = await createRepo(tempDirs);
    const unknownModel = {...selectedModelReference, id: "missing-model"};

    await expect(
      createSession({id: "doomed-worktree", message: {...firstMessage, modelReference: unknownModel}, projectPath: repo, workspace: {baseRef: "main", mode: "worktree"}})
    ).rejects.toMatchObject({_tag: "CreateSessionError"});

    expect(await pi.store.find("doomed-worktree")).toBeUndefined();
    const {stdout} = await exec("git", ["worktree", "list", "--porcelain"], {cwd: repo, env: gitEnv});
    expect(stdout.split("\n").filter((line) => line.startsWith("worktree "))).toHaveLength(1);
    expect((await exec("git", ["branch", "--list", "supernova/*"], {cwd: repo, env: gitEnv})).stdout.trim()).toBe("");
  });

  it("creates an empty session when no message is given", async () => {
    const {createSession, pi} = await setup();

    const session = await createSession({id: "empty", projectPath: "/workspace"});

    expect(session).toMatchObject({id: "empty", entries: [], turns: {}});
    expect(existsSync(join(pi.sessionStorageRoot, "empty", "session.sqlite"))).toBe(true);
  });
});
