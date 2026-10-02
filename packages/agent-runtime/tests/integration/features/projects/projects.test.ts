import {mkdir, mkdtemp, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {Projects} from "@supernova/agent-runtime/features/projects/projects";
import type {SessionRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";
import {SessionStore} from "@supernova/agent-runtime/pi/session-store";
import {cleanupTempDirs} from "@tests/support/async";

function record(overrides: Partial<SessionRecord>): SessionRecord {
  return {id: "session-1", projectPath: "/workspace", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides};
}

describe("listing and archiving project sessions", () => {
  const tempDirs: string[] = [];
  const originalAgentDir = process.env.PI_CODING_AGENT_DIR;

  afterEach(() => {
    cleanupTempDirs(tempDirs);
    if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  });

  /** A store whose index holds `records`. Records are written as the store persists them; no session file is opened. */
  async function projectsWith(records: readonly SessionRecord[]): Promise<{projects: Projects; store: SessionStore; agentDir: string}> {
    const agentDir = await mkdtemp(join(tmpdir(), "supernova-agent-"));
    tempDirs.push(agentDir);
    process.env.PI_CODING_AGENT_DIR = agentDir;
    const root = join(agentDir, "sessions-v2");
    await mkdir(root, {recursive: true});
    await writeFile(join(root, "index.json"), JSON.stringify({version: 1, sessions: Object.fromEntries(records.map((item) => [item.id, item]))}));
    const store = new SessionStore({root, sdk: {} as never, resourceCache: {} as never, tools: () => []});
    return {projects: new Projects({store}), store, agentDir};
  }

  it("returns the project's sessions newest-first from the index", async () => {
    const {projects} = await projectsWith([
      record({id: "older", title: "Older", updatedAt: "2026-01-01T00:00:00.000Z"}),
      record({id: "newest", title: "Newest", updatedAt: "2026-01-03T00:00:00.000Z"}),
      record({id: "middle", updatedAt: "2026-01-02T00:00:00.000Z", worktree: {branch: "supernova/x", path: "/wt"}}),
      record({id: "elsewhere", projectPath: "/other"}),
    ]);

    const result = await projects.listSessions({projectPath: "/workspace"});

    expect(result).toEqual({
      projectPath: "/workspace",
      sessions: [
        {id: "newest", forked: false, title: "Newest", updatedAt: "2026-01-03T00:00:00.000Z", worktree: false},
        {id: "middle", forked: false, title: "Untitled session", updatedAt: "2026-01-02T00:00:00.000Z", worktree: true},
        {id: "older", forked: false, title: "Older", updatedAt: "2026-01-01T00:00:00.000Z", worktree: false},
      ],
    });
  });

  it("archives a session by removing it from the listing and keeps its record", async () => {
    const {projects, store} = await projectsWith([record({id: "session-1"})]);

    const result = await projects.archiveSession({projectPath: "/workspace", sessionId: "session-1"});

    expect(result).toEqual({projectPath: "/workspace", sessionId: "session-1"});
    expect((await projects.listSessions({projectPath: "/workspace"})).sessions).toEqual([]);
    expect(await store.find("session-1")).toMatchObject({archivedAt: expect.any(String)});
  });

  it("fails clearly when archiving a missing session", async () => {
    const {projects} = await projectsWith([record({id: "session-1"})]);

    await expect(projects.archiveSession({projectPath: "/workspace", sessionId: "missing"})).rejects.toMatchObject({
      _tag: "ProjectSessionArchiveError",
      message: "Session not found.",
    });
  });

  describe("legacy sessions", () => {
    /** A legacy session file as the old SDK wrote it, under Pi's per-project folder of `/workspace`. */
    async function writeLegacySession(agentDir: string, id: string): Promise<string> {
      const directory = join(agentDir, "sessions", "--workspace--");
      await mkdir(directory, {recursive: true});
      const path = join(directory, `2026-01-01T00-00-00-000Z_${id}.jsonl`);
      const header = {type: "session", version: 3, id, timestamp: "2026-01-01T00:00:00.000Z", cwd: "/workspace"};
      const user = {type: "message", id: "u1", parentId: null, timestamp: "2026-01-01T00:00:01.000Z", message: {role: "user", content: "Legacy request", timestamp: 1}};
      await writeFile(path, `${JSON.stringify(header)}\n${JSON.stringify(user)}\n`);
      return path;
    }

    it("lists legacy sessions next to durable ones", async () => {
      const {projects, agentDir} = await projectsWith([record({id: "durable", updatedAt: "2027-01-01T00:00:00.000Z"})]);
      await writeLegacySession(agentDir, "legacy-1");

      const result = await projects.listSessions({projectPath: "/workspace"});

      expect(result.sessions.map((session) => session.id)).toEqual(["durable", "legacy-1"]);
      expect(result.sessions[1]).toMatchObject({title: "Legacy request"});
    });

    it("archives a legacy session by moving its file aside, unmodified", async () => {
      const {projects, agentDir} = await projectsWith([]);
      const path = await writeLegacySession(agentDir, "legacy-1");

      await projects.archiveSession({projectPath: "/workspace", sessionId: "legacy-1"});

      await expect(stat(path)).rejects.toThrow();
      expect((await stat(join(agentDir, "sessions", "--workspace--", "archive", "2026-01-01T00-00-00-000Z_legacy-1.jsonl"))).isFile()).toBe(true);
    });
  });
});
