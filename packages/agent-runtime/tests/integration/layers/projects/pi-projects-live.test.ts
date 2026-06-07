import {mkdir, mkdtemp, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Effect, Layer} from "effect";
import {afterEach, describe, expect, it, vi} from "vitest";
import {PiSdkService} from "@supernova/agent-runtime/layers/pi-sdk";
import type {PiSdkServiceShape, PiSessionInfo} from "@supernova/agent-runtime/layers/pi-sdk";
import {PiProjectsLive} from "@supernova/agent-runtime/layers/projects/pi-projects-live";
import {ProjectsService} from "@supernova/agent-runtime/services/projects-service";
import {cleanupTempDirs} from "@tests/support/layers/test-utils";

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

function makePiSdk(sessions: PiSessionInfo[]): PiSdkServiceShape {
  return {
    SessionManager: {
      list: vi.fn(async () => sessions),
    },
    createAgentSession: vi.fn(),
  } as unknown as PiSdkServiceShape;
}

function runWithProjects<A, E>(piSdk: PiSdkServiceShape, effect: Effect.Effect<A, E, ProjectsService>) {
  return Effect.runPromise(effect.pipe(Effect.provide(PiProjectsLive.pipe(Layer.provide(Layer.succeed(PiSdkService, piSdk))))));
}

describe("listing and archiving Pi project sessions", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    cleanupTempDirs(tempDirs);
    vi.restoreAllMocks();
  });

  it("returns all project sessions newest-first", async () => {
    const piSdk = makePiSdk([
      session({id: "older", modified: new Date("2026-01-01T00:00:00.000Z"), name: "Older"}),
      session({id: "newest", modified: new Date("2026-01-03T00:00:00.000Z"), name: "Newest"}),
      session({id: "middle", modified: new Date("2026-01-02T00:00:00.000Z"), name: "Middle"}),
    ]);

    const result = await runWithProjects(
      piSdk,
      Effect.gen(function* () {
        const projects = yield* ProjectsService;
        return yield* projects.listSessions({projectPath: "/workspace"});
      })
    );

    expect(result).toMatchObject({projectPath: "/workspace", sessions: [{id: "newest"}, {id: "middle"}, {id: "older"}]});
  });

  it("archives a session by moving the backing session file into an archive directory", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "supernova-agent-runtime-"));
    tempDirs.push(tempDir);
    const sessionPath = join(tempDir, "session-1.jsonl");
    await writeFile(sessionPath, "{}\n");
    const piSdk = makePiSdk([session({id: "session-1", path: sessionPath})]);

    const result = await runWithProjects(
      piSdk,
      Effect.gen(function* () {
        const projects = yield* ProjectsService;
        return yield* projects.archiveSession("/workspace", "session-1");
      })
    );

    const archiveStat = await stat(join(tempDir, "archive", "session-1.jsonl"));
    expect(archiveStat.isFile()).toBe(true);
    await expect(stat(sessionPath)).rejects.toThrow();
    expect(result).toEqual({projectPath: "/workspace", sessionId: "session-1"});
  });

  it("fails clearly when archiving a missing session", async () => {
    const piSdk = makePiSdk([session({id: "session-1"})]);

    await expect(
      runWithProjects(
        piSdk,
        Effect.gen(function* () {
          const projects = yield* ProjectsService;
          return yield* projects.archiveSession("/workspace", "missing");
        })
      )
    ).rejects.toMatchObject({_tag: "ProjectSessionArchiveError", message: "Session not found."});
  });

  it("fails clearly when the archived session file already exists", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "supernova-agent-runtime-"));
    tempDirs.push(tempDir);
    const sessionPath = join(tempDir, "session-1.jsonl");
    const archivePath = join(tempDir, "archive", "session-1.jsonl");
    await writeFile(sessionPath, "{}\n");
    await mkdir(join(tempDir, "archive"));
    await writeFile(archivePath, "{}\n");
    const piSdk = makePiSdk([session({id: "session-1", path: sessionPath})]);

    await expect(
      runWithProjects(
        piSdk,
        Effect.gen(function* () {
          const projects = yield* ProjectsService;
          return yield* projects.archiveSession("/workspace", "session-1");
        })
      )
    ).rejects.toMatchObject({_tag: "ProjectSessionArchiveError", message: "Archived session already exists."});
  });
});
