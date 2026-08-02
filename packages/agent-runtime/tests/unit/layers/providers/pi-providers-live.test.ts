import type {AuthInteraction} from "@earendil-works/pi-ai";
import {Effect, Fiber, Layer, ManagedRuntime, Stream} from "effect";
import {afterEach, describe, expect, it, vi} from "vitest";
import type {ProviderLoginSession} from "@supernova/contracts/providers/schemas";
import {PiSdkService} from "@supernova/agent-runtime/layers/pi-sdk";
import type {PiSdkServiceShape} from "@supernova/agent-runtime/layers/pi-sdk";
import {PiProvidersLive} from "@supernova/agent-runtime/layers/providers/pi-providers-live";
import {ProvidersService} from "@supernova/agent-runtime/services/providers-service";
import {waitUntil} from "@tests/support/layers/test-utils";

function makePiSdk(input?: {
  readonly initialStoredProviderIds?: readonly string[];
  readonly login?: (providerId: string, interaction: AuthInteraction, authType: "api_key" | "oauth") => Promise<void>;
  readonly storedCredentials?: Map<string, {key: string; type: "api_key" | "oauth"}>;
}): PiSdkServiceShape {
  const storedCredentials = input?.storedCredentials ?? new Map<string, {key: string; type: "api_key" | "oauth"}>();
  for (const providerId of input?.initialStoredProviderIds ?? ["anthropic"]) {
    storedCredentials.set(providerId, {key: "stored-token", type: "oauth"});
  }

  const providers = [
    {
      auth: {apiKey: {login: vi.fn()}, oauth: {login: vi.fn()}},
      id: "anthropic",
      name: "Anthropic",
    },
    {
      auth: {apiKey: {login: vi.fn()}},
      id: "openai",
      name: "OpenAI",
    },
    {
      auth: {apiKey: {}},
      id: "google-vertex",
      name: "Google Vertex",
    },
  ];

  return {
    modelRuntime: {
      getProvider: vi.fn((providerId: string) => providers.find((provider) => provider.id === providerId)),
      getProviderAuthStatus: vi.fn((providerId: string) => {
        const stored = storedCredentials.get(providerId);
        if (stored) return {configured: true, label: stored.type === "api_key" ? "API key" : "OAuth token", source: "stored"};
        if (providerId === "openai") return {configured: true, label: "OPENAI_API_KEY", source: "environment"};
        return {configured: false};
      }),
      getProviders: vi.fn(() => providers),
      listCredentials: vi.fn(async () => Array.from(storedCredentials, ([providerId, credential]) => ({providerId, type: credential.type}))),
      login: vi.fn(async (providerId: string, type: "api_key" | "oauth", interaction: AuthInteraction) => {
        if (input?.login) {
          await input.login(providerId, interaction, type);
        } else if (type === "api_key") {
          const key = await interaction.prompt({message: "API key", type: "secret"});
          storedCredentials.set(providerId, {key, type});
          return {key, type};
        }

        storedCredentials.set(providerId, {key: "stored-token", type});
        return type === "api_key"
          ? {env: {TEST_ACCOUNT_ID: "account-id"}, key: "stored-token", type}
          : {access: "stored-token", expires: Date.now() + 60_000, refresh: "refresh-token", type};
      }),
      logout: vi.fn(async (providerId: string) => {
        storedCredentials.delete(providerId);
      }),
      refresh: vi.fn(async () => ({aborted: false, errors: new Map()})),
    },
  } as unknown as PiSdkServiceShape;
}

function makeProvidersRuntime(piSdk: PiSdkServiceShape) {
  return ManagedRuntime.make(PiProvidersLive.pipe(Layer.provide(Layer.succeed(PiSdkService, piSdk))));
}

function currentLoginSession(loginSessionId: string) {
  return Effect.gen(function* () {
    const providers = yield* ProvidersService;
    const sessions = yield* providers.watchLoginSession(loginSessionId).pipe(Stream.take(1), Stream.runCollect);
    const session = sessions[0];
    if (!session) throw new Error("Provider login session did not emit an initial state.");
    return session;
  });
}

describe("managing Pi provider authentication", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists provider-owned login methods and ambient providers", async () => {
    const runtime = makeProvidersRuntime(makePiSdk());
    const result = await runtime.runPromise(
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
        authTypes: ["external"],
        connected: false,
        disconnectable: false,
        id: "google-vertex",
        name: "Google Vertex",
        source: undefined,
        sourceLabel: undefined,
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
      login: async (_providerId, interaction) => {
        interaction.notify({instructions: "Open this URL", type: "auth_url", url: "https://auth.example/login"});
        interaction.notify({message: "Waiting for code", type: "progress"});
        submittedInputs.push(await interaction.prompt({message: "Paste the code", placeholder: "code", type: "text"}));
      },
    });

    const runtime = makeProvidersRuntime(piSdk);
    const started = await runtime.runPromise(
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        return yield* providers.startLogin("anthropic", "oauth");
      })
    );

    await waitUntil(async () => {
      const state = await runtime.runPromise(currentLoginSession(started.loginSessionId));
      expect(state).toMatchObject({step: {input: {message: "Paste the code", placeholder: "code"}, type: "prompt"}});
    });

    const submitted = await runtime.runPromise(
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        return yield* providers.submitLoginInput(started.loginSessionId, "abc123");
      })
    );

    await waitUntil(async () => {
      const state = await runtime.runPromise(currentLoginSession(started.loginSessionId));
      expect(state).toMatchObject({progress: "Connected", step: {type: "succeeded"}});
    });

    expect(submitted).toMatchObject({step: {type: "authenticating"}});
    expect(submittedInputs).toEqual(["abc123"]);
  });

  it("streams structured selector, device-code, and informational steps", async () => {
    const piSdk = makePiSdk({
      login: async (_providerId, interaction) => {
        interaction.notify({links: [{label: "Help", url: "https://example.com/help"}], message: "Choose a login method", type: "info"});
        await interaction.prompt({
          message: "Select login method",
          options: [
            {description: "Open a browser", id: "browser", label: "Browser login"},
            {id: "device", label: "Device code"},
          ],
          type: "select",
        });
        interaction.notify({expiresInSeconds: 600, intervalSeconds: 5, type: "device_code", userCode: "ABCD-1234", verificationUri: "https://github.com/login/device"});
      },
    });
    const runtime = makeProvidersRuntime(piSdk);
    const streamed: ProviderLoginSession[] = [];

    const started = await runtime.runPromise(
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        return yield* providers.startLogin("anthropic", "oauth");
      })
    );
    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        yield* providers.watchLoginSession(started.loginSessionId).pipe(Stream.runForEach((session) => Effect.sync(() => streamed.push(session))));
      })
    );

    expect(started.step.type).toBe("info");
    await waitUntil(() => {
      expect(streamed.some((session) => session.step.type === "select")).toBe(true);
    });
    await runtime.runPromise(
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        return yield* providers.submitLoginInput(started.loginSessionId, "device");
      })
    );
    await waitUntil(() => {
      expect(streamed.some((session) => session.step.type === "device_code" && session.step.userCode === "ABCD-1234")).toBe(true);
    });
    await runtime.runPromise(Fiber.interrupt(fiber));
  });

  it("runs multi-step API-key authentication through generic provider prompts", async () => {
    const submittedInputs: string[] = [];
    const runtime = makeProvidersRuntime(
      makePiSdk({
        initialStoredProviderIds: [],
        login: async (_providerId, interaction, authType) => {
          if (authType !== "api_key") return;
          submittedInputs.push(await interaction.prompt({message: "Enter API key", type: "secret"}));
          submittedInputs.push(await interaction.prompt({message: "Enter account ID", type: "text"}));
        },
      })
    );
    const started = await runtime.runPromise(
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        return yield* providers.startLogin("anthropic", "api_key");
      })
    );

    await waitUntil(async () => {
      const state = await runtime.runPromise(currentLoginSession(started.loginSessionId));
      expect(state).toMatchObject({step: {input: {message: "Enter API key", secret: true}, type: "prompt"}});
    });
    await runtime.runPromise(
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        return yield* providers.submitLoginInput(started.loginSessionId, "sk-test");
      })
    );
    await waitUntil(async () => {
      const state = await runtime.runPromise(currentLoginSession(started.loginSessionId));
      expect(state).toMatchObject({step: {input: {message: "Enter account ID", secret: false}, type: "prompt"}});
    });
    await runtime.runPromise(
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        return yield* providers.submitLoginInput(started.loginSessionId, "account-id");
      })
    );
    await waitUntil(async () => {
      const state = await runtime.runPromise(currentLoginSession(started.loginSessionId));
      expect(state.step.type).toBe("succeeded");
    });

    expect(submittedInputs).toEqual(["sk-test", "account-id"]);
  });

  it("logs out stored provider credentials and exposes the provider as disconnected", async () => {
    const storedCredentials = new Map<string, {key: string; type: "api_key" | "oauth"}>();
    const runtime = makeProvidersRuntime(makePiSdk({storedCredentials}));

    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        return yield* providers.logout("anthropic");
      })
    );
    const providers = await runtime.runPromise(
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        return yield* providers.list();
      })
    );

    expect(result).toEqual({providerId: "anthropic"});
    expect(storedCredentials.has("anthropic")).toBe(false);
    expect(providers.find((provider) => provider.id === "anthropic")).toMatchObject({connected: false, disconnectable: false});
  });

  it("cancels an OAuth login that is waiting for manual code input", async () => {
    let loginSignal: AbortSignal | undefined;
    const runtime = makeProvidersRuntime(
      makePiSdk({
        login: async (_providerId, interaction) => {
          loginSignal = interaction.signal;
          await interaction.prompt({message: "Paste the final redirect URL or authorization code.", placeholder: "Redirect URL or authorization code", type: "manual_code"});
        },
      })
    );
    const started = await runtime.runPromise(
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        return yield* providers.startLogin("anthropic", "oauth");
      })
    );

    await waitUntil(async () => {
      const state = await runtime.runPromise(currentLoginSession(started.loginSessionId));
      expect(state).toMatchObject({step: {manualInput: {message: "Paste the final redirect URL or authorization code."}, type: "browser_auth"}});
    });

    const cancelled = await runtime.runPromise(
      Effect.gen(function* () {
        const providers = yield* ProvidersService;
        return yield* providers.cancelLogin(started.loginSessionId);
      })
    );

    expect(cancelled).toMatchObject({step: {type: "cancelled"}});
    expect(loginSignal?.aborted).toBe(true);
  });
});
