import {Effect, Layer} from "effect";
import {afterEach, describe, expect, it, vi} from "vitest";
import {PiSdkService} from "@supernova/agent-runtime/layers/pi-sdk";
import type {PiSdkServiceShape} from "@supernova/agent-runtime/layers/pi-sdk";
import {loginSessions} from "@supernova/agent-runtime/layers/providers/lib/login-sessions";
import {PiProvidersLive} from "@supernova/agent-runtime/layers/providers/pi-providers-live";
import {ProvidersService} from "@supernova/agent-runtime/services/providers-service";
import {waitUntil} from "@tests/support/layers/test-utils";

interface OAuthLoginOptions {
  readonly onAuth: (info: {instructions?: string; url: string}) => void;
  readonly onManualCodeInput: () => Promise<string>;
  readonly onProgress: (message: string) => void;
  readonly onPrompt: (prompt: {allowEmpty?: boolean; message: string; placeholder?: string}) => Promise<string>;
  readonly signal: AbortSignal;
}

function makePiSdk(input?: {
  readonly initialStoredProviderIds?: readonly string[];
  readonly login?: (providerId: string, options: OAuthLoginOptions) => Promise<void>;
  readonly storedCredentials?: Map<string, {key: string; type: "api_key" | "oauth"}>;
}): PiSdkServiceShape {
  const storedCredentials = input?.storedCredentials ?? new Map<string, {key: string; type: "api_key" | "oauth"}>();
  for (const providerId of input?.initialStoredProviderIds ?? ["anthropic"]) {
    storedCredentials.set(providerId, {key: "stored-token", type: "oauth"});
  }

  return {
    authStorage: {
      getOAuthProviders: vi.fn(() => [
        {id: "anthropic", name: "Anthropic"},
        {id: "google-vertex", name: "Google Vertex"},
      ]),
      login: vi.fn(input?.login ?? (async () => undefined)),
      logout: vi.fn((providerId: string) => {
        storedCredentials.delete(providerId);
      }),
      reload: vi.fn(),
      set: vi.fn((providerId: string, credential: {key: string; type: "api_key"}) => {
        storedCredentials.set(providerId, credential);
      }),
    },
    modelRegistry: {
      getAll: vi.fn(() => [{provider: "openai"}, {provider: "anthropic"}, {provider: "amazon-bedrock"}]),
      getProviderAuthStatus: vi.fn((providerId: string) => {
        const stored = storedCredentials.get(providerId);
        if (stored) return {configured: true, label: stored.type === "api_key" ? "API key" : "OAuth token", source: "stored"};
        if (providerId === "openai") return {configured: true, label: "OPENAI_API_KEY", source: "environment"};
        return {configured: false, label: undefined, source: undefined};
      }),
      getProviderDisplayName: vi.fn((providerId: string) => (providerId === "openai" ? "OpenAI" : "Anthropic")),
      refresh: vi.fn(),
    },
  } as unknown as PiSdkServiceShape;
}

function runWithProviders<A, E>(piSdk: PiSdkServiceShape, effect: Effect.Effect<A, E, ProvidersService>) {
  return Effect.runPromise(effect.pipe(Effect.provide(PiProvidersLive.pipe(Layer.provide(Layer.succeed(PiSdkService, piSdk))))));
}

describe("managing Pi provider authentication", () => {
  afterEach(() => {
    loginSessions.clear();
    vi.restoreAllMocks();
  });

  it("lists providers from models and OAuth metadata, hiding providers authenticated externally", async () => {
    const piSdk = makePiSdk();

    const result = await runWithProviders(
      piSdk,
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        return yield* providers.list();
      })
    );

    expect(result).toEqual([
      {
        authTypes: ["api_key", "oauth"],
        connected: true,
        disconnectable: true,
        id: "anthropic",
        name: "Anthropic",
        source: "stored",
        sourceLabel: "OAuth token",
      },
      {
        authTypes: ["api_key"],
        connected: true,
        disconnectable: false,
        id: "openai",
        name: "OpenAI",
        source: "environment",
        sourceLabel: "OPENAI_API_KEY",
      },
    ]);
  });

  it("tracks an OAuth login through auth URL, input prompt, submitted input, and success", async () => {
    const submittedInputs: string[] = [];
    const piSdk = makePiSdk({
      login: async (_providerId, options) => {
        options.onAuth({instructions: "Open this URL", url: "https://auth.example/login"});
        options.onProgress("Waiting for code");
        submittedInputs.push(await options.onPrompt({message: "Paste the code", placeholder: "code"}));
      },
    });

    const started = await runWithProviders(
      piSdk,
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        return yield* providers.startOAuthLogin("anthropic");
      })
    );

    await waitUntil(async () => {
      const state = await runWithProviders(
        piSdk,
        Effect.gen(function* () {
          const providers = yield* ProvidersService;
          return yield* providers.getLoginSession(started.loginSessionId);
        })
      );
      expect(state).toMatchObject({inputKind: "prompt", prompt: "Paste the code", status: "waiting_input"});
    });

    const submitted = await runWithProviders(
      piSdk,
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        return yield* providers.submitLoginInput(started.loginSessionId, "abc123");
      })
    );

    await waitUntil(async () => {
      const state = await runWithProviders(
        piSdk,
        Effect.gen(function* () {
          const providers = yield* ProvidersService;
          return yield* providers.getLoginSession(started.loginSessionId);
        })
      );
      expect(state).toMatchObject({progress: "Connected", status: "succeeded"});
    });

    expect(submitted).toMatchObject({prompt: undefined, status: "authenticating"});
    expect(submittedInputs).toEqual(["abc123"]);
  });

  it("stores trimmed API keys and exposes the provider as connected", async () => {
    const storedCredentials = new Map<string, {key: string; type: "api_key" | "oauth"}>();
    const piSdk = makePiSdk({initialStoredProviderIds: [], storedCredentials});

    const result = await runWithProviders(
      piSdk,
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        return yield* providers.setApiKey("anthropic", "  sk-test  ");
      })
    );
    const providers = await runWithProviders(
      piSdk,
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        return yield* providers.list();
      })
    );

    expect(result).toEqual({providerId: "anthropic"});
    expect(storedCredentials.get("anthropic")).toEqual({key: "sk-test", type: "api_key"});
    expect(providers.find((provider) => provider.id === "anthropic")).toMatchObject({connected: true, disconnectable: true, source: "stored", sourceLabel: "API key"});
  });

  it("rejects blank API keys", async () => {
    const storedCredentials = new Map<string, {key: string; type: "api_key" | "oauth"}>();
    const piSdk = makePiSdk({initialStoredProviderIds: [], storedCredentials});

    await expect(
      runWithProviders(
        piSdk,
        Effect.gen(function* () {
          const providers = yield* ProvidersService;
          return yield* providers.setApiKey("anthropic", "   ");
        })
      )
    ).rejects.toMatchObject({_tag: "ProviderApiKeySetError", message: "API key is required."});
    expect(storedCredentials.has("anthropic")).toBe(false);
  });

  it("logs out stored provider credentials and exposes the provider as disconnected", async () => {
    const storedCredentials = new Map<string, {key: string; type: "api_key" | "oauth"}>();
    const piSdk = makePiSdk({storedCredentials});

    const result = await runWithProviders(
      piSdk,
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        return yield* providers.logout("anthropic");
      })
    );
    const providers = await runWithProviders(
      piSdk,
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        return yield* providers.list();
      })
    );

    expect(result).toEqual({providerId: "anthropic"});
    expect(storedCredentials.has("anthropic")).toBe(false);
    expect(providers.find((provider) => provider.id === "anthropic")).toMatchObject({connected: false, disconnectable: false});
  });

  it("cancels an OAuth login that is waiting for user input", async () => {
    let loginSignal: AbortSignal | undefined;
    const piSdk = makePiSdk({
      login: async (_providerId, options) => {
        loginSignal = options.signal;
        await options.onManualCodeInput();
      },
    });

    const started = await runWithProviders(
      piSdk,
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        return yield* providers.startOAuthLogin("anthropic");
      })
    );

    await waitUntil(async () => {
      const state = await runWithProviders(
        piSdk,
        Effect.gen(function* () {
          const providers = yield* ProvidersService;
          return yield* providers.getLoginSession(started.loginSessionId);
        })
      );
      expect(state).toMatchObject({inputKind: "manual_code", status: "waiting_input"});
    });

    const cancelled = await runWithProviders(
      piSdk,
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        return yield* providers.cancelLogin(started.loginSessionId);
      })
    );

    expect(cancelled).toMatchObject({status: "cancelled"});
    expect(loginSignal?.aborted).toBe(true);
  });
});
