import {mkdtemp, readFile, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Effect, Layer} from "effect";
import {afterEach, describe, expect, it, vi} from "vitest";
import {PiSdkService} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import type {PiSdkServiceShape, PiSessionInfo} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import {PiSessionsLive} from "@pi-desktop/agent-runtime/implementations/pi/sessions/pi-sessions-live";
import {SessionsService} from "@pi-desktop/agent-runtime/services/sessions/sessions-service";

function session(overrides: Partial<PiSessionInfo>): PiSessionInfo {
  return {
    cwd: "/workspace",
    firstMessage: "Fix it",
    id: "session-1",
    modified: new Date("2026-01-01T00:00:00.000Z"),
    name: "Fix it",
    path: "/sessions/session-1.jsonl",
    ...overrides,
  } as PiSessionInfo;
}

function makePiSdk(input?: {
  createdSessionFile?: string;
  sessionContext?: {messages: unknown[]; model?: {modelId: string; provider: string}; thinkingLevel?: string};
  sessions?: PiSessionInfo[];
}): PiSdkServiceShape {
  return {
    SessionManager: {
      create: vi.fn(() => ({
        getHeader: () => ({sessionId: "created-session", timestamp: "2026-01-01T00:00:00.000Z"}),
        getSessionFile: () => input?.createdSessionFile,
        getSessionId: () => "created-session",
      })),
      list: vi.fn(async () => input?.sessions ?? []),
      listAll: vi.fn(async () => input?.sessions ?? [session({})]),
      open: vi.fn(() => ({
        buildSessionContext: () =>
          input?.sessionContext ?? {
            messages: [],
            model: undefined,
            thinkingLevel: undefined,
          },
      })),
    },
    authStorage: {
      reload: vi.fn(),
    },
    createAgentSession: vi.fn(),
    modelRegistry: {
      getAvailable: vi.fn(async () => [
        {
          api: "anthropic",
          baseUrl: "https://api.anthropic.com",
          contextWindow: 200_000,
          cost: {cacheRead: 0, cacheWrite: 0, input: 0, output: 0},
          id: "claude-sonnet",
          input: ["text"],
          maxTokens: 8192,
          name: "Claude Sonnet",
          provider: "anthropic",
          reasoning: true,
        },
      ]),
      getProviderDisplayName: vi.fn(() => "Anthropic"),
      refresh: vi.fn(),
    },
  } as unknown as PiSdkServiceShape;
}

function runWithSessions<A, E>(piSdk: PiSdkServiceShape, effect: Effect.Effect<A, E, SessionsService>) {
  return Effect.runPromise(effect.pipe(Effect.provide(PiSessionsLive.pipe(Layer.provide(Layer.succeed(PiSdkService, piSdk))))));
}

describe("PiSessionsLive", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a new session file and returns an empty session details payload", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "pi-desktop-session-"));
    const sessionFile = join(tempDir, "created-session.jsonl");
    const piSdk = makePiSdk({createdSessionFile: sessionFile});

    const result = await runWithSessions(
      piSdk,
      Effect.gen(function* () {
        const sessions = yield* SessionsService;
        return yield* sessions.create("/workspace");
      })
    );

    await expect(readFile(sessionFile, "utf8")).resolves.toBe('{"sessionId":"created-session","timestamp":"2026-01-01T00:00:00.000Z"}\n');
    expect(result).toEqual({id: "created-session", projectPath: "/workspace", title: "New session", turns: [], updatedAt: "2026-01-01T00:00:00.000Z"});
  });

  it("loads a persisted session with the selected model and normalized transcript", async () => {
    const sessionPath = join(await mkdtemp(join(tmpdir(), "pi-desktop-loaded-session-")), "session-1.jsonl");
    await writeFile(sessionPath, "{}\n");
    const piSdk = makePiSdk({
      sessionContext: {
        messages: [
          {content: [{text: "Fix it", type: "text"}], id: "user-1", role: "user", timestamp: 1},
          {content: [{text: "Done", type: "text"}], id: "assistant-1", role: "assistant", timestamp: 2},
        ],
        model: {modelId: "claude-sonnet", provider: "anthropic"},
        thinkingLevel: "high",
      },
      sessions: [session({path: sessionPath})],
    });

    const result = await runWithSessions(
      piSdk,
      Effect.gen(function* () {
        const sessions = yield* SessionsService;
        return yield* sessions.get("session-1");
      })
    );

    expect(result).toMatchObject({
      id: "session-1",
      model: {id: "claude-sonnet", providerId: "anthropic", thinkingLevel: "high"},
      projectPath: "/workspace",
      title: "Fix it",
      turns: [{events: [{content: "Done", type: "assistant"}], userMessage: {content: "Fix it"}}],
    });
  });

  it("lists available prompt models after refreshing provider credentials and model metadata", async () => {
    const piSdk = makePiSdk();

    const result = await runWithSessions(
      piSdk,
      Effect.gen(function* () {
        const sessions = yield* SessionsService;
        return yield* sessions.listModels();
      })
    );

    expect(piSdk.authStorage.reload).toHaveBeenCalled();
    expect(piSdk.modelRegistry.refresh).toHaveBeenCalled();
    expect(result).toMatchObject([{id: "claude-sonnet", name: "Claude Sonnet", providerId: "anthropic", providerName: "Anthropic"}]);
  });
});
