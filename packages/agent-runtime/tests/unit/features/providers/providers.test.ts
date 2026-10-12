import type {AuthInteraction} from "@earendil-works/pi-ai";
import {afterEach, describe, expect, it, vi} from "vitest";
import type {ProviderLoginSession} from "@supernova/contracts/services/providers/schemas";
import {LoginSessions} from "@supernova/agent-runtime/features/providers/login/login-sessions";
import {Providers} from "@supernova/agent-runtime/features/providers/providers";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";
import {waitUntil} from "@tests/support/async";

function makePiSdk(input?: {
  readonly initialStoredProviderIds?: readonly string[];
  readonly login?: (providerId: string, interaction: AuthInteraction, authType: "api_key" | "oauth") => Promise<void>;
  readonly storedCredentials?: Map<string, {key: string; type: "api_key" | "oauth"}>;
}): PiSdk {
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
  } as unknown as PiSdk;
}

function makeProviders(sdk: PiSdk): {providers: Providers; loginSessions: LoginSessions} {
  const loginSessions = new LoginSessions();
  return {loginSessions, providers: new Providers({loginSessions, sdk})};
}

describe("managing Pi provider authentication", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists provider-owned login methods and ambient providers", async () => {
    const {providers} = makeProviders(makePiSdk());
    const result = await providers.list();

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

    const {providers, loginSessions} = makeProviders(piSdk);
    const started = await providers.startLogin({authType: "oauth", providerId: "anthropic"});

    await waitUntil(() => {
      const state = loginSessions.get(started.loginSessionId);
      expect(state).toMatchObject({step: {input: {message: "Paste the code", placeholder: "code"}, type: "prompt"}});
    });

    const submitted = await providers.submitLoginInput({input: "abc123", loginSessionId: started.loginSessionId});

    await waitUntil(() => {
      const state = loginSessions.get(started.loginSessionId);
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
    const {providers} = makeProviders(piSdk);
    const streamed: ProviderLoginSession[] = [];

    const started = await providers.startLogin({authType: "oauth", providerId: "anthropic"});
    expect(started.step.type).toBe("info");

    // The logins' replicated state delivers the current step (the login has already reached the selector), then each change.
    const reachedDeviceCode = new Promise<void>((resolve) => {
      let last: ProviderLoginSession | undefined;
      const stop = providers.logins.subscribe((state) => {
        const session = state.logins[started.loginSessionId];
        if (!session || session === last) return;
        last = session;
        streamed.push(session);
        if (session.step.type === "select") providers.submitLoginInput({input: "device", loginSessionId: started.loginSessionId});
        if (session.step.type === "device_code") {
          stop();
          resolve();
        }
      });
    });
    await reachedDeviceCode;

    expect(streamed.map((session) => session.step.type)).toEqual(["select", "authenticating", "device_code"]);
    expect(streamed[0]?.step).toMatchObject({message: "Select login method", type: "select"});
    expect(streamed.at(-1)?.step).toMatchObject({type: "device_code", userCode: "ABCD-1234"});
  });

  it("runs multi-step API-key authentication through generic provider prompts", async () => {
    const submittedInputs: string[] = [];
    const {providers, loginSessions} = makeProviders(
      makePiSdk({
        initialStoredProviderIds: [],
        login: async (_providerId, interaction, authType) => {
          if (authType !== "api_key") return;
          submittedInputs.push(await interaction.prompt({message: "Enter API key", type: "secret"}));
          submittedInputs.push(await interaction.prompt({message: "Enter account ID", type: "text"}));
        },
      })
    );
    const started = await providers.startLogin({authType: "api_key", providerId: "anthropic"});

    await waitUntil(() => {
      const state = loginSessions.get(started.loginSessionId);
      expect(state).toMatchObject({step: {input: {message: "Enter API key", secret: true}, type: "prompt"}});
    });
    await providers.submitLoginInput({input: "sk-test", loginSessionId: started.loginSessionId});
    await waitUntil(() => {
      const state = loginSessions.get(started.loginSessionId);
      expect(state).toMatchObject({step: {input: {message: "Enter account ID", secret: false}, type: "prompt"}});
    });
    await providers.submitLoginInput({input: "account-id", loginSessionId: started.loginSessionId});
    await waitUntil(() => {
      const state = loginSessions.get(started.loginSessionId);
      expect(state.step.type).toBe("succeeded");
    });

    expect(submittedInputs).toEqual(["sk-test", "account-id"]);
  });

  it("logs out stored provider credentials and exposes the provider as disconnected", async () => {
    const storedCredentials = new Map<string, {key: string; type: "api_key" | "oauth"}>();
    const {providers} = makeProviders(makePiSdk({storedCredentials}));

    const result = await providers.logout({providerId: "anthropic"});
    const listed = await providers.list();

    expect(result).toEqual({providerId: "anthropic"});
    expect(storedCredentials.has("anthropic")).toBe(false);
    expect(listed.find((provider) => provider.id === "anthropic")).toMatchObject({connected: false, disconnectable: false});
  });

  it("cancels an OAuth login that is waiting for manual code input", async () => {
    let loginSignal: AbortSignal | undefined;
    const {providers, loginSessions} = makeProviders(
      makePiSdk({
        login: async (_providerId, interaction) => {
          loginSignal = interaction.signal;
          await interaction.prompt({message: "Paste the final redirect URL or authorization code.", placeholder: "Redirect URL or authorization code", type: "manual_code"});
        },
      })
    );
    const started = await providers.startLogin({authType: "oauth", providerId: "anthropic"});

    await waitUntil(() => {
      const state = loginSessions.get(started.loginSessionId);
      expect(state).toMatchObject({step: {manualInput: {message: "Paste the final redirect URL or authorization code."}, type: "browser_auth"}});
    });

    const cancelled = await providers.cancelLogin({loginSessionId: started.loginSessionId});

    expect(cancelled).toMatchObject({step: {type: "cancelled"}});
    expect(loginSignal?.aborted).toBe(true);
  });
});
