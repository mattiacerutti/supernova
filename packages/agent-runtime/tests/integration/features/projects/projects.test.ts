import {mkdir, mkdtemp, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it, vi} from "vitest";
import {Projects} from "@supernova/agent-runtime/features/projects/projects";
import type {ProjectsDeps} from "@supernova/agent-runtime/features/projects/projects";
import type {PiSessionInfo} from "@supernova/agent-runtime/pi/sdk";
import {cleanupTempDirs} from "@tests/support/async";

function session(overrides: Partial<PiSessionInfo>): PiSessionInfo {
  return {
    cwd: "/workspace",
    firstMessage: "Fix it",
    id: "session-1",
    modified: new Date("2026-01-01T00:00:00.000Z"),
    name: undefined,
    path: "/sessions/session-1.jsonl",
    ...overrides,
  } as PiSessionInfo;
}

function projectsWith(sessions: PiSessionInfo[]): Projects {
  return new Projects({sdk: {SessionManager: {list: vi.fn(async () => sessions)} as unknown as ProjectsDeps["sdk"]["SessionManager"]}});
}

describe("listing and archiving Pi project sessions", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    cleanupTempDirs(tempDirs);
    vi.restoreAllMocks();
  });

  it("returns all project sessions newest-first", async () => {
    const projects = projectsWith([
      session({id: "older", modified: new Date("2026-01-01T00:00:00.000Z"), name: "Older"}),
      session({id: "newest", modified: new Date("2026-01-03T00:00:00.000Z"), name: "Newest"}),
      session({id: "middle", modified: new Date("2026-01-02T00:00:00.000Z"), name: "Middle"}),
    ]);

    const result = await projects.listSessions({projectPath: "/workspace"});

    expect(result).toMatchObject({projectPath: "/workspace", sessions: [{id: "newest"}, {id: "middle"}, {id: "older"}]});
  });

  it("archives a session by moving the backing session file into an archive directory", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "supernova-agent-runtime-"));
    tempDirs.push(tempDir);
    const sessionPath = join(tempDir, "session-1.jsonl");
    await writeFile(sessionPath, "{}\n");
    const projects = projectsWith([session({id: "session-1", path: sessionPath})]);

    const result = await projects.archiveSession({projectPath: "/workspace", sessionId: "session-1"});

    const archiveStat = await stat(join(tempDir, "archive", "session-1.jsonl"));
    expect(archiveStat.isFile()).toBe(true);
    await expect(stat(sessionPath)).rejects.toThrow();
    expect(result).toEqual({projectPath: "/workspace", sessionId: "session-1"});
  });

  it("fails clearly when archiving a missing session", async () => {
    const projects = projectsWith([session({id: "session-1"})]);

    await expect(projects.archiveSession({projectPath: "/workspace", sessionId: "missing"})).rejects.toMatchObject({
      _tag: "ProjectSessionArchiveError",
      message: "Session not found.",
    });
  });

  it("fails clearly when the archived session file already exists", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "supernova-agent-runtime-"));
    tempDirs.push(tempDir);
    const sessionPath = join(tempDir, "session-1.jsonl");
    const archivePath = join(tempDir, "archive", "session-1.jsonl");
    await writeFile(sessionPath, "{}\n");
    await mkdir(join(tempDir, "archive"));
    await writeFile(archivePath, "{}\n");
    const projects = projectsWith([session({id: "session-1", path: sessionPath})]);

    await expect(projects.archiveSession({projectPath: "/workspace", sessionId: "session-1"})).rejects.toMatchObject({
      _tag: "ProjectSessionArchiveError",
      message: "Archived session already exists.",
    });
  });
});
