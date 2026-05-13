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
  branch?: unknown[];
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
        getBranch: () => input?.branch ?? [],
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

  it("loads raw branch history instead of compacted LLM context messages", async () => {
    const sessionPath = join(await mkdtemp(join(tmpdir(), "pi-desktop-loaded-session-")), "session-1.jsonl");
    await writeFile(sessionPath, "{}\n");
    const piSdk = makePiSdk({
      branch: [
        {
          id: "old-user",
          message: {content: [{text: "Original request", type: "text"}], id: "old-user-message", role: "user", timestamp: 1},
          parentId: null,
          timestamp: "1970-01-01T00:00:00.001Z",
          type: "message",
        },
        {
          id: "old-assistant",
          message: {content: [{text: "Original response", type: "text"}], id: "old-assistant-message", role: "assistant", timestamp: 2},
          parentId: "old-user",
          timestamp: "1970-01-01T00:00:00.002Z",
          type: "message",
        },
        {
          firstKeptEntryId: "recent-user",
          id: "compaction-1",
          parentId: "old-assistant",
          summary: "Compacted summary that should not render.",
          timestamp: "1970-01-01T00:00:00.003Z",
          tokensBefore: 1000,
          type: "compaction",
        },
        {
          id: "recent-user",
          message: {content: [{text: "Recent request", type: "text"}], id: "recent-user-message", role: "user", timestamp: 4},
          parentId: "compaction-1",
          timestamp: "1970-01-01T00:00:00.004Z",
          type: "message",
        },
        {
          id: "recent-assistant",
          message: {content: [{text: "Recent response", type: "text"}], id: "recent-assistant-message", role: "assistant", timestamp: 5},
          parentId: "recent-user",
          timestamp: "1970-01-01T00:00:00.005Z",
          type: "message",
        },
      ],
      sessionContext: {
        messages: [
          {content: [{text: "Compacted summary that should not render.", type: "text"}], id: "summary-1", role: "user", timestamp: 3},
          {content: [{text: "Recent request", type: "text"}], id: "recent-user-message", role: "user", timestamp: 4},
          {content: [{text: "Recent response", type: "text"}], id: "recent-assistant-message", role: "assistant", timestamp: 5},
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
      turns: [
        {events: [{content: "Original response", type: "assistant"}], userMessage: {content: "Original request"}},
        {events: [{content: "Recent response", type: "assistant"}], userMessage: {content: "Recent request"}},
      ],
    });
  });

  it("loads attachment metadata and image previews from compacted raw branch history", async () => {
    const sessionPath = join(await mkdtemp(join(tmpdir(), "pi-desktop-loaded-attachments-")), "session-1.jsonl");
    await writeFile(sessionPath, "{}\n");
    const piSdk = makePiSdk({
      branch: [
        {
          customType: "pi-desktop.attachments",
          data: {attachments: [{id: "image-1", kind: "image", mime: "image/png", name: "diagram.png", order: 0, size: 12}]},
          id: "attachments-1",
          parentId: null,
          timestamp: "1970-01-01T00:00:00.001Z",
          type: "custom",
        },
        {
          id: "old-user",
          message: {
            content: [
              {text: "Review this diagram", type: "text"},
              {data: "aW1hZ2UtYnl0ZXM=", mimeType: "image/png", type: "image"},
            ],
            id: "old-user-message",
            role: "user",
            timestamp: 2,
          },
          parentId: "attachments-1",
          timestamp: "1970-01-01T00:00:00.002Z",
          type: "message",
        },
        {
          id: "old-assistant",
          message: {content: [{text: "Looks good.", type: "text"}], id: "old-assistant-message", role: "assistant", timestamp: 3},
          parentId: "old-user",
          timestamp: "1970-01-01T00:00:00.003Z",
          type: "message",
        },
        {
          firstKeptEntryId: "recent-user",
          id: "compaction-1",
          parentId: "old-assistant",
          summary: "Compacted summary.",
          timestamp: "1970-01-01T00:00:00.004Z",
          tokensBefore: 1000,
          type: "compaction",
        },
        {
          id: "recent-user",
          message: {content: [{text: "Continue", type: "text"}], id: "recent-user-message", role: "user", timestamp: 5},
          parentId: "compaction-1",
          timestamp: "1970-01-01T00:00:00.005Z",
          type: "message",
        },
      ],
      sessionContext: {
        messages: [{content: [{text: "Compacted summary.", type: "text"}], id: "summary-1", role: "user", timestamp: 4}],
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

    expect(result.turns[0]?.userMessage).toMatchObject({
      attachments: [{contentBase64: "aW1hZ2UtYnl0ZXM=", id: "image-1", mime: "image/png", name: "diagram.png", size: 12}],
      content: "Review this diagram",
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
