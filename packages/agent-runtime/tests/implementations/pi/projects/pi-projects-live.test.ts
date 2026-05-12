import {mkdtemp, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Effect, Layer} from "effect";
import {afterEach, describe, expect, it, vi} from "vitest";
import {PiSdkService} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import type {PiSdkServiceShape, PiSessionInfo} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import {PiProjectsLive} from "@pi-desktop/agent-runtime/implementations/pi/projects/pi-projects-live";
import {ProjectsService} from "@pi-desktop/agent-runtime/services/projects/projects-service";

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

describe("PiProjectsLive", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns project sessions newest-first and continues after the cursor without repeating earlier pages", async () => {
    const piSdk = makePiSdk([
      session({id: "older", modified: new Date("2026-01-01T00:00:00.000Z"), name: "Older"}),
      session({id: "newest", modified: new Date("2026-01-03T00:00:00.000Z"), name: "Newest"}),
      session({id: "middle", modified: new Date("2026-01-02T00:00:00.000Z"), name: "Middle"}),
    ]);

    const firstPage = await runWithProjects(
      piSdk,
      Effect.gen(function* () {
        const projects = yield* ProjectsService;
        return yield* projects.listSessions({limit: 2, projectPath: "/workspace"});
      })
    );
    const secondPage = await runWithProjects(
      piSdk,
      Effect.gen(function* () {
        const projects = yield* ProjectsService;
        return yield* projects.listSessions({cursor: firstPage.nextCursor, limit: 2, projectPath: "/workspace"});
      })
    );

    expect(firstPage).toMatchObject({hasMore: true, nextCursor: "middle", sessions: [{id: "newest"}, {id: "middle"}]});
    expect(secondPage).toMatchObject({hasMore: false, sessions: [{id: "older"}]});
    expect(secondPage.nextCursor).toBeUndefined();
  });

  it("archives a session by moving the backing session file into an archive directory", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "pi-desktop-agent-runtime-"));
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
});
