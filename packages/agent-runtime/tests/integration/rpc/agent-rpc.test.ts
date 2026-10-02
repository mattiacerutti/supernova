import {execFile} from "node:child_process";
import {existsSync} from "node:fs";
import {mkdtemp, realpath, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import {AgentRpcGroup} from "@supernova/contracts";
import type {CreateSessionPayload} from "@supernova/contracts/sessions/procedures";
import {Effect} from "effect";
import {RpcTest} from "effect/unstable/rpc";
import {afterEach, describe, expect, it} from "vitest";
import {Worktrees} from "@supernova/agent-runtime/features/worktrees/worktrees";
import {agentRpcLayer} from "@supernova/agent-runtime/rpc/agent-rpc";
import type {AgentRuntime} from "@supernova/agent-runtime/runtime";
import {cleanupTempDirs} from "@tests/support/async";
import {createPiTestRuntime, fauxAssistantMessage, selectedModelReference} from "@tests/support/session-runtime";

const firstMessage = {contentParts: [{text: "Hi", type: "text" as const}], modelReference: selectedModelReference};

const exec = promisify(execFile);
const gitEnv = {...process.env, GIT_AUTHOR_NAME: "Ada", GIT_AUTHOR_EMAIL: "a@x", GIT_COMMITTER_NAME: "Ada", GIT_COMMITTER_EMAIL: "a@x"};

async function createRepo(tempDirs: string[]): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "supernova-rpc-repo-"));
  tempDirs.push(repo);
  await exec("git", ["init", "-q", "-b", "main"], {cwd: repo, env: gitEnv});
  await writeFile(join(repo, "a.txt"), "a\n");
  await exec("git", ["add", "-A"], {cwd: repo, env: gitEnv});
  await exec("git", ["commit", "-q", "-m", "first"], {cwd: repo, env: gitEnv});
  return realpath(repo);
}

describe("agent rpc: createSession", () => {
  const runtimes: Array<{unregister: () => Promise<void>}> = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (runtimes.length > 0) await runtimes.pop()?.unregister();
    cleanupTempDirs(tempDirs);
  });

  /** Drives the RPC layer over a test runtime whose sessions live on disk and are reopened by the worker, as in production. */
  async function setup() {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const worktreeStorage = await mkdtemp(join(tmpdir(), "supernova-rpc-worktrees-"));
    tempDirs.push(worktreeStorage);
    // Only the features createSession orchestrates are real; the rest are never reached.
    const runtime = {sessionRuntime: pi.sessionRuntime, sessions: pi.sessions, worktrees: new Worktrees(worktreeStorage)} as AgentRuntime;
    const createSession = (payload: CreateSessionPayload) =>
      Effect.runPromise(Effect.scoped(Effect.flatMap(RpcTest.makeClient(AgentRpcGroup), (client) => client.createSession(payload))).pipe(Effect.provide(agentRpcLayer(runtime))));
    return {createSession, pi};
  }

  it("creates the session and starts its first turn in one call", async () => {
    const {createSession, pi} = await setup();
    pi.faux.setResponses([fauxAssistantMessage("Hello!")]);

    const events = await pi.collectEvents(
      () => createSession({id: "first-send", message: firstMessage, projectPath: "/workspace"}),
      (events) => {
        if (!events.some((event) => event.type === "session.snapshot" && event.sessionId === "first-send" && event.session.turns.length === 1))
          throw new Error("No final snapshot.");
      }
    );

    expect(events.findLast((event) => event.type === "session.snapshot")).toMatchObject({
      session: {id: "first-send", turns: [{userMessage: {contentParts: firstMessage.contentParts}}]},
    });
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

    const events = await pi.collectEvents(
      () => createSession({id: "in-worktree", message: firstMessage, projectPath: repo, workspace: {baseRef: "main", mode: "worktree"}}),
      (events) => {
        if (!events.some((event) => event.type === "session.snapshot" && event.sessionId === "in-worktree" && event.session.turns.length === 1))
          throw new Error("No final snapshot.");
      }
    );

    const snapshot = events.findLast((event) => event.type === "session.snapshot");
    expect(snapshot).toMatchObject({session: {projectPath: repo, title: "Generated title", worktree: {branch: expect.stringMatching(/^supernova\/[a-z]+-[a-z]+$/)}}});
    const worktreePath = snapshot?.type === "session.snapshot" ? snapshot.session.worktree?.path : undefined;
    expect(worktreePath && existsSync(join(worktreePath, "a.txt"))).toBe(true);
    expect(await pi.store.cwd("in-worktree")).toBe(worktreePath);
    const setupEvents = events.filter((event) => event.type === "session.setup.started" || event.type === "session.setup.ended").map((event) => event.type);
    expect(setupEvents).toEqual(["session.setup.started", "session.setup.ended"]);
    const firstTurnEvent = events.findIndex((event) => event.type === "session.agent.started");
    expect(events.findIndex((event) => event.type === "session.setup.ended")).toBeLessThan(firstTurnEvent);
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

    expect(session).toMatchObject({id: "empty", turns: []});
    expect(existsSync(join(pi.sessionStorageRoot, "empty", "session.sqlite"))).toBe(true);
  });
});
