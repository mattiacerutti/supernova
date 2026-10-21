import type {AuthInteraction, OAuthCredential, ProviderAuthInteraction} from "@earendil-works/pi-ai";
import {InMemoryCredentialStore} from "@earendil-works/pi-ai";
import {ModelRuntime} from "@earendil-works/pi-coding-agent";
import {RUNTIME_HOST} from "@supernova/contracts/lib/protocol";
import type {ProviderLoginStep} from "@supernova/contracts/services/providers/schemas";
import {ProviderLoginSession as ProviderLoginSessionSchema} from "@supernova/contracts/services/providers/schemas";
import {ProvidersService} from "@supernova/contracts/services/providers/services";
import {afterEach, describe, expect, it} from "vitest";
import {LoginSessions} from "@supernova/agent-runtime/features/providers/login/login-sessions";
import {Providers} from "@supernova/agent-runtime/features/providers/providers";
import type {AgentRuntime} from "@supernova/agent-runtime/runtime";
import {waitUntil} from "@tests/support/async";
import {startRuntimeServer} from "@tests/support/runtime-server";

type LoginScript = (interaction: ProviderAuthInteraction) => Promise<string>;

const noStreaming = {
  stream: () => {
    throw new Error("Test providers have no models to stream.");
  },
  streamSimple: () => {
    throw new Error("Test providers have no models to stream.");
  },
};

/** Pi's real runtime with two providers: "Acme", whose logins the test scripts, and "Ambient", configured only from outside Pi. */
async function acmeRuntime(scripts: {readonly apiKey?: LoginScript; readonly oauth?: LoginScript}) {
  const modelRuntime = await ModelRuntime.create({credentials: new InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false});
  modelRuntime.registerNativeProvider({
    id: "acme",
    name: "Acme",
    getModels: () => [],
    ...noStreaming,
    auth: {
      apiKey: {
        name: "Acme API key",
        login: async (interaction) => ({type: "api_key", key: await (scripts.apiKey ?? ((prompt) => prompt.prompt({message: "API key", type: "secret"})))(interaction)}),
        resolve: async ({credential}) => (credential?.key ? {auth: {apiKey: credential.key}} : undefined),
      },
      oauth: {
        name: "Acme SSO",
        login: async (interaction): Promise<OAuthCredential> => ({
          type: "oauth",
          access: await (scripts.oauth ?? (async () => "token"))(interaction),
          refresh: "refresh",
          expires: Date.now() + 3_600_000,
        }),
        refresh: async (credential) => credential,
        toAuth: async (credential) => ({apiKey: credential.access}),
      },
    },
  });
  modelRuntime.registerNativeProvider({
    id: "ambient",
    name: "Ambient",
    getModels: () => [],
    ...noStreaming,
    auth: {apiKey: {name: "Ambient key", resolve: async () => (process.env.AMBIENT_KEY ? {auth: {apiKey: process.env.AMBIENT_KEY}, source: "AMBIENT_KEY"} : undefined)}},
  });
  return modelRuntime;
}

describe("provider authentication over the wire", () => {
  const cleanups: Array<() => Promise<void> | void> = [];
  const environment = {...process.env};

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()!();
    process.env = {...environment};
  });

  async function connect(scripts: Parameters<typeof acmeRuntime>[0] = {}) {
    const modelRuntime = await acmeRuntime(scripts);
    const providers = new Providers({loginSessions: new LoginSessions(), sdk: {modelRuntime}});
    const server = startRuntimeServer({providers} as AgentRuntime);
    cleanups.push(server.close);
    const service = server.client.get(ProvidersService, {}, {at: RUNTIME_HOST});
    const steps: ProviderLoginStep[] = [];
    const stop = service.logins.subscribe((state) => {
      for (const session of Object.values(state?.logins ?? {})) {
        // The client parses nothing, so contract drift would only show as a broken settings page.
        ProviderLoginSessionSchema.parse(session);
        // Chord sends only the latest value: steps a tick apart can merge, so only steps a login waits on are certain.
        if (JSON.stringify(steps.at(-1)) !== JSON.stringify(session.step)) steps.push(session.step);
      }
    });
    cleanups.push(stop);
    await service.ready;
    const unwrap = async <T>(call: Promise<{ok: true; value: T} | {ok: false; error: {code: string; message: string}}>): Promise<T> => {
      const result = await call;
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      return result.value;
    };
    const waitForStep = (type: ProviderLoginStep["type"]) => waitUntil(() => expect(steps.at(-1)?.type).toBe(type));
    return {modelRuntime, service, steps, unwrap, waitForStep};
  }

  it("lists each provider's login methods and where its credential comes from", async () => {
    process.env.OPENAI_API_KEY = "sk-env";
    const {modelRuntime, service, unwrap} = await connect();
    await modelRuntime.login("acme", "oauth", {prompt: async () => "", notify: () => undefined} satisfies AuthInteraction);

    const listed = await unwrap(service.list(null));

    expect(listed.find((provider) => provider.id === "acme")).toEqual({
      authTypes: ["api_key", "oauth"],
      connected: true,
      disconnectable: true,
      id: "acme",
      name: "Acme",
      source: "stored",
    });
    expect(listed.find((provider) => provider.id === "ambient")).toMatchObject({authTypes: ["external"], connected: false, disconnectable: false});
    // An environment key connects a provider but is not Pi's to remove.
    expect(listed.find((provider) => provider.id === "openai")).toMatchObject({connected: true, disconnectable: false, source: "environment", sourceLabel: "OPENAI_API_KEY"});
    expect(listed.map((provider) => provider.name)).toEqual(listed.map((provider) => provider.name).toSorted((left, right) => left.localeCompare(right)));
  });

  it("runs a browser login with a pasted code to success, and the provider is then connected", async () => {
    const {service, steps, unwrap, waitForStep} = await connect({
      oauth: async (interaction) => {
        interaction.notify({type: "auth_url", url: "https://acme.example/login", instructions: "Open this URL"});
        interaction.notify({type: "progress", message: "Waiting for the browser"});
        return interaction.prompt({type: "manual_code", message: "Paste the code", placeholder: "code"});
      },
    });

    const started = await unwrap(service.startLogin({authType: "oauth", providerId: "acme"}));
    expect(started.step).toEqual({authUrl: "https://acme.example/login", instructions: "Open this URL", type: "browser_auth"});
    await waitUntil(() => expect(steps.at(-1)).toMatchObject({manualInput: {message: "Paste the code", placeholder: "code"}, type: "browser_auth"}));

    expect(await unwrap(service.submitLoginInput({input: "abc123", loginSessionId: started.loginSessionId}))).toMatchObject({step: {type: "authenticating"}});
    await waitForStep("succeeded");

    expect((await unwrap(service.list(null))).find((provider) => provider.id === "acme")).toMatchObject({connected: true, disconnectable: true});
  });

  it("walks a selector and a device code, then an API key prompted in two steps", async () => {
    let approve!: () => void;
    const approved = new Promise<void>((resolve) => (approve = resolve));
    const {service, steps, unwrap, waitForStep} = await connect({
      oauth: async (interaction) => {
        interaction.notify({type: "info", message: "Choose a method", links: [{url: "https://acme.example/help"}]});
        const method = await interaction.prompt({type: "select", message: "Login method", options: [{id: "device", label: "Device code"}]});
        interaction.notify({type: "device_code", userCode: "ABCD-1234", verificationUri: "https://acme.example/device"});
        await approved;
        return method;
      },
      apiKey: async (interaction) => {
        const key = await interaction.prompt({type: "secret", message: "API key"});
        const account = await interaction.prompt({type: "text", message: "Account ID"});
        return `${key}:${account}`;
      },
    });

    const oauth = await unwrap(service.startLogin({authType: "oauth", providerId: "acme"}));
    expect(oauth.step).toEqual({links: [{url: "https://acme.example/help"}], message: "Choose a method", type: "info"});
    await waitUntil(() => expect(steps.at(-1)).toEqual({message: "Login method", options: [{id: "device", label: "Device code"}], type: "select"}));
    await unwrap(service.submitLoginInput({input: "device", loginSessionId: oauth.loginSessionId}));
    await waitUntil(() => expect(steps.at(-1)).toEqual({type: "device_code", userCode: "ABCD-1234", verificationUri: "https://acme.example/device"}));
    approve();
    await waitForStep("succeeded");

    const apiKey = await unwrap(service.startLogin({authType: "api_key", providerId: "acme"}));
    expect(apiKey.step).toEqual({input: {message: "API key", secret: true}, type: "prompt"});
    await unwrap(service.submitLoginInput({input: "sk-test", loginSessionId: apiKey.loginSessionId}));
    await waitUntil(() => expect(steps.at(-1)).toEqual({input: {message: "Account ID", secret: false}, type: "prompt"}));
    await unwrap(service.submitLoginInput({input: "account-1", loginSessionId: apiKey.loginSessionId}));
    await waitForStep("succeeded");
  });

  it("cancels a login waiting for input, aborting the provider's flow", async () => {
    let signal: AbortSignal | undefined;
    const {service, unwrap, waitForStep} = await connect({
      oauth: async (interaction) => {
        signal = interaction.signal;
        return interaction.prompt({type: "manual_code", message: "Paste the code"});
      },
    });
    const started = await unwrap(service.startLogin({authType: "oauth", providerId: "acme"}));
    expect(started.step).toMatchObject({type: "browser_auth", manualInput: {message: "Paste the code"}});

    expect(await unwrap(service.cancelLogin({loginSessionId: started.loginSessionId}))).toMatchObject({step: {type: "cancelled"}});
    await waitForStep("cancelled");
    expect(signal?.aborted).toBe(true);
    expect(await service.submitLoginInput({input: "late", loginSessionId: started.loginSessionId})).toEqual({
      ok: false,
      error: {code: "ProviderLoginError", message: "Login session is not waiting for input."},
    });
  });

  it("shows a provider's login failure with its message", async () => {
    const {service, steps, unwrap, waitForStep} = await connect({
      apiKey: async () => {
        throw new Error("Acme rejected the key.");
      },
    });

    await unwrap(service.startLogin({authType: "api_key", providerId: "acme"}));
    await waitForStep("failed");

    expect(steps.at(-1)).toEqual({error: "Acme rejected the key.", type: "failed"});
  });

  it("refuses a login method the provider does not offer", async () => {
    const {service} = await connect();

    expect(await service.startLogin({authType: "oauth", providerId: "ambient"})).toEqual({
      ok: false,
      error: {code: "ProviderLoginError", message: "Provider does not support OAuth login."},
    });
    expect(await service.startLogin({authType: "api_key", providerId: "ambient"})).toEqual({
      ok: false,
      error: {code: "ProviderLoginError", message: "Provider does not support API key login."},
    });
  });

  it("logs out a stored credential, leaving the provider disconnected", async () => {
    const {modelRuntime, service, unwrap} = await connect();
    await modelRuntime.login("acme", "api_key", {prompt: async () => "sk-stored", notify: () => undefined});

    expect(await unwrap(service.logout({providerId: "acme"}))).toEqual({providerId: "acme"});

    expect((await unwrap(service.list(null))).find((provider) => provider.id === "acme")).toMatchObject({connected: false, disconnectable: false});
    expect(await modelRuntime.listCredentials()).toEqual([]);
  });
});
