import {Effect, Layer} from "effect";
import {afterEach, describe, expect, it, vi} from "vitest";
import {PiSdkService} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import type {IPiSdkService} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import {loginSessions} from "@pi-desktop/agent-runtime/implementations/pi/providers/lib/login-sessions";
import {PiProvidersLive} from "@pi-desktop/agent-runtime/implementations/pi/providers/pi-providers-live";
import {ProvidersService} from "@pi-desktop/agent-runtime/services/providers/providers-service";

interface IOAuthLoginOptions {
  readonly onAuth: (info: {instructions?: string; url: string}) => void;
  readonly onManualCodeInput: () => Promise<string>;
  readonly onProgress: (message: string) => void;
  readonly onPrompt: (prompt: {allowEmpty?: boolean; message: string; placeholder?: string}) => Promise<string>;
  readonly signal: AbortSignal;
}

function makePiSdk(input?: {login?: (providerId: string, options: IOAuthLoginOptions) => Promise<void>}): IPiSdkService {
  return {
    authStorage: {
      getOAuthProviders: vi.fn(() => [
        {id: "anthropic", name: "Anthropic"},
        {id: "google-vertex", name: "Google Vertex"},
      ]),
      login: vi.fn(input?.login ?? (async () => undefined)),
      reload: vi.fn(),
    },
    modelRegistry: {
      getAll: vi.fn(() => [{provider: "openai"}, {provider: "anthropic"}, {provider: "amazon-bedrock"}]),
      getProviderAuthStatus: vi.fn((providerId: string) => {
        if (providerId === "anthropic") return {configured: false, label: "OAuth token", source: "stored"};
        if (providerId === "openai") return {configured: true, label: "OPENAI_API_KEY", source: "environment"};
        return {configured: false, label: undefined, source: undefined};
      }),
      getProviderDisplayName: vi.fn((providerId: string) => (providerId === "openai" ? "OpenAI" : "Anthropic")),
      refresh: vi.fn(),
    },
  } as unknown as IPiSdkService;
}

function runWithProviders<A, E>(piSdk: IPiSdkService, effect: Effect.Effect<A, E, ProvidersService>) {
  return Effect.runPromise(effect.pipe(Effect.provide(PiProvidersLive.pipe(Layer.provide(Layer.succeed(PiSdkService, piSdk))))));
}

async function waitUntil(assertion: () => void): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < 1_000) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  throw lastError;
}

describe("PiProvidersLive", () => {
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

    await waitUntil(() => {
      const state = loginSessions.get(started.loginSessionId);
      expect(state).toMatchObject({inputKind: "prompt", prompt: "Paste the code", status: "waiting_input"});
    });

    const submitted = await runWithProviders(
      piSdk,
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        return yield* providers.submitLoginInput(started.loginSessionId, "abc123");
      })
    );

    await waitUntil(() => {
      const state = loginSessions.get(started.loginSessionId);
      expect(state).toMatchObject({progress: "Connected", status: "succeeded"});
    });

    expect(submitted).toMatchObject({prompt: undefined, status: "authenticating"});
    expect(submittedInputs).toEqual(["abc123"]);
    expect(piSdk.modelRegistry.refresh).toHaveBeenCalled();
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

    await waitUntil(() => {
      const state = loginSessions.get(started.loginSessionId);
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
