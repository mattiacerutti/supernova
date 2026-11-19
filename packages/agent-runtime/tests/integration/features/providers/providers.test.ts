import type {OAuthCredential, ProviderAuthInteraction} from "@earendil-works/pi-ai";
import {InMemoryCredentialStore} from "@earendil-works/pi-ai";
import {ModelRuntime} from "@earendil-works/pi-coding-agent";
import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {compile} from "@earendil-works/pi-schema";
import type {LoginState} from "@supernova/contracts/services/providers/schemas";
import {LoginState as LoginStateSchema} from "@supernova/contracts/services/providers/schemas";
import {ProvidersService} from "@supernova/contracts/services/providers/services";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";
import {waitUntil} from "@tests/support/async";
import {startTestServerHost} from "@tests/support/server-host";

type LoginScript = (interaction: ProviderAuthInteraction) => Promise<string>;

const noStreaming = {
  stream: () => {
    throw new Error("Test providers have no models to stream.");
  },
  streamSimple: () => {
    throw new Error("Test providers have no models to stream.");
  },
};

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

function waitingLogin() {
  let signal: AbortSignal | undefined;
  const script: LoginScript = async (interaction) => {
    signal = interaction.signal;
    return interaction.prompt({type: "manual_code", message: "Paste the code"});
  };
  return {script, aborted: () => signal?.aborted === true};
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
    // The server as it composes itself; only providers are reached.
    const sessionStorageRoot = await mkdtemp(join(tmpdir(), "supernova-providers-"));
    const server = await startTestServerHost({sdk: {modelRuntime} as unknown as PiSdk, sessionStorageRoot});
    cleanups.push(() => rm(sessionStorageRoot, {force: true, recursive: true}), server.close);
    const held = await server.client.get(ProvidersService, {}, context);
    if (held.variant !== "owner") throw new Error("The owner's providers variant did not bind.");

    const logins: LoginState[] = [];
    const watch = await held.login.watch(context);
    const record = (login: LoginState | null) => {
      if (!login) return;
      // The client parses nothing, so contract drift would only show as a broken settings page.
      expect(compile(LoginStateSchema).errors(login)).toEqual([]);
      logins.push(login);
    };
    record(watch.value);
    watch.start(async (call) => {
      if (call.kind === "value") record(call.value);
    });
    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      await watch.stop();
      held.release();
    };
    cleanups.push(release);

    // Chord sends only the latest value: states a tick apart can merge, so only states a login waits on are certain.
    const current = () => held.login.value;
    const waitFor = (status: LoginState["status"]) => waitUntil(() => expect(current()?.status).toBe(status));
    const waitForPrompt = () =>
      waitUntil(() => expect(current()?.prompt).not.toBeNull()).then(() => {
        const prompt = current()?.prompt;
        if (!prompt) throw new Error("The login has no open question.");
        return prompt;
      });
    const providers = () => held.providers.value;
    const provider = (id: string) => providers().find((entry) => entry.id === id);
    const service = {
      start: (payload: Parameters<typeof held.start>[0]) => held.start(payload, context),
      answer: (payload: Parameters<typeof held.answer>[0]) => held.answer(payload, context),
      cancel: (payload: Parameters<typeof held.cancel>[0]) => held.cancel(payload, context),
      dismiss: (payload: Parameters<typeof held.dismiss>[0]) => held.dismiss(payload, context),
      logout: (payload: Parameters<typeof held.logout>[0]) => held.logout(payload, context),
    };
    return {server, release, modelRuntime, service, logins, current, waitFor, waitForPrompt, provider, providers};
  }

  it("lists each provider's login methods and where its credential comes from", async () => {
    process.env.OPENAI_API_KEY = "sk-env";
    const {service, waitFor, provider, providers} = await connect();
    await service.start({authType: "oauth", providerId: "acme"});
    await waitFor("success");

    const listed = providers();
    expect(provider("acme")).toEqual({authTypes: ["api_key", "oauth"], connected: true, disconnectable: true, id: "acme", name: "Acme", source: "stored"});
    expect(provider("ambient")).toMatchObject({authTypes: ["external"], connected: false, disconnectable: false});
    // An environment key connects a provider but is not Pi's to remove.
    expect(provider("openai")).toMatchObject({connected: true, disconnectable: false, source: "environment", sourceLabel: "OPENAI_API_KEY"});
    expect(listed.map((entry) => entry.name)).toEqual(listed.map((entry) => entry.name).toSorted((left, right) => left.localeCompare(right)));
  });

  it("runs a browser login with a pasted code to success, and the provider is then connected", async () => {
    const {service, current, logins, waitFor, waitForPrompt, provider} = await connect({
      oauth: async (interaction) => {
        interaction.notify({type: "auth_url", url: "https://acme.example/login", instructions: "Open this URL"});
        interaction.notify({type: "progress", message: "Waiting for the browser"});
        return interaction.prompt({type: "manual_code", message: "Paste the code", placeholder: "code"});
      },
    });
    expect(provider("acme")).toMatchObject({connected: false});

    const {attemptId} = await service.start({authType: "oauth", providerId: "acme"});
    const prompt = await waitForPrompt();
    expect(prompt).toMatchObject({type: "manual_code", message: "Paste the code", placeholder: "code"});
    expect(current()?.notices).toEqual([
      {type: "auth_url", url: "https://acme.example/login", instructions: "Open this URL"},
      {type: "progress", message: "Waiting for the browser"},
    ]);

    await service.answer({attemptId, promptId: prompt.id, value: "abc123"});
    await waitFor("success");

    expect(logins.every((login) => login.attemptId === attemptId)).toBe(true);
    expect(current()).toMatchObject({prompt: null, message: "Connected."});
    expect(provider("acme")).toMatchObject({connected: true, disconnectable: true});
  });

  it("walks a selector and a device code, then an API key asked in two questions", async () => {
    let approve!: () => void;
    const approved = new Promise<void>((resolve) => (approve = resolve));
    const {service, current, waitFor, waitForPrompt} = await connect({
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

    const oauth = await service.start({authType: "oauth", providerId: "acme"});
    const select = await waitForPrompt();
    expect(select).toEqual({id: select.id, type: "select", message: "Login method", options: [{id: "device", label: "Device code"}]});
    expect(current()?.notices).toEqual([{type: "info", message: "Choose a method", links: [{url: "https://acme.example/help"}]}]);
    await expect(service.answer({attemptId: oauth.attemptId, promptId: select.id, value: "browser"})).rejects.toMatchObject({
      code: "ProviderLoginError",
      message: "Select one of the listed options.",
    });
    await service.answer({attemptId: oauth.attemptId, promptId: select.id, value: "device"});
    await waitUntil(() => expect(current()?.notices.at(-1)).toEqual({type: "device_code", userCode: "ABCD-1234", verificationUri: "https://acme.example/device"}));
    expect(current()?.prompt).toBeNull();
    approve();
    await waitFor("success");

    const apiKey = await service.start({authType: "api_key", providerId: "acme"});
    const key = await waitForPrompt();
    expect(key).toMatchObject({type: "secret", message: "API key"});
    await service.answer({attemptId: apiKey.attemptId, promptId: key.id, value: "sk-test"});
    await waitUntil(() => expect(current()?.prompt).toMatchObject({type: "text", message: "Account ID"}));
    const account = current()!.prompt!;
    expect(account.id).not.toBe(key.id);
    await expect(service.answer({attemptId: apiKey.attemptId, promptId: key.id, value: "again"})).rejects.toMatchObject({
      code: "ProviderLoginError",
      message: "This login question was already answered.",
    });
    await service.answer({attemptId: apiKey.attemptId, promptId: account.id, value: "account-1"});
    await waitFor("success");
  });

  it("cancels a login waiting for an answer, aborting the provider's flow", async () => {
    const login = waitingLogin();
    const {service, current, waitForPrompt} = await connect({oauth: login.script});
    const {attemptId} = await service.start({authType: "oauth", providerId: "acme"});
    const prompt = await waitForPrompt();

    await service.cancel({attemptId});

    expect(current()).toMatchObject({status: "cancelled", prompt: null, message: "Login cancelled."});
    expect(login.aborted()).toBe(true);
    await expect(service.answer({attemptId, promptId: prompt.id, value: "late"})).rejects.toMatchObject({
      code: "ProviderLoginError",
      message: "This login is no longer active.",
    });
  });

  it("closes a finished login's dialog: the cancel leaves its result, the dismissal clears it", async () => {
    const {service, current, waitFor} = await connect();
    const {attemptId} = await service.start({authType: "oauth", providerId: "acme"});
    await waitFor("success");

    await service.cancel({attemptId});
    expect(current()).toMatchObject({attemptId, status: "success"});

    await service.dismiss({attemptId});
    expect(current()).toBeNull();
  });

  it("runs one login at a time, and starts another once it has ended", async () => {
    const login = waitingLogin();
    const {service, current, waitForPrompt} = await connect({oauth: login.script});
    const {attemptId} = await service.start({authType: "oauth", providerId: "acme"});
    await waitForPrompt();

    await expect(service.start({authType: "api_key", providerId: "acme"})).rejects.toMatchObject({
      code: "ProviderLoginError",
      message: "A provider login is already in progress; cancel it first.",
    });
    await expect(service.logout({providerId: "acme"})).rejects.toMatchObject({
      code: "ProviderLoginError",
      message: "Cancel the login in progress before removing a credential.",
    });
    await service.dismiss({attemptId});
    expect(current()).toMatchObject({attemptId, status: "working"});

    await service.cancel({attemptId});
    expect((await service.start({authType: "api_key", providerId: "acme"})).attemptId).not.toBe(attemptId);
  });

  it("shows a provider's login failure with its message", async () => {
    const {service, current, waitFor} = await connect({
      apiKey: async () => {
        throw new Error("Acme rejected the key.");
      },
    });

    await service.start({authType: "api_key", providerId: "acme"});
    await waitFor("error");

    expect(current()).toMatchObject({status: "error", message: "Acme rejected the key.", prompt: null});
  });

  it("refuses a login method the provider does not offer", async () => {
    const {service, current} = await connect();

    await expect(service.start({authType: "oauth", providerId: "ambient"})).rejects.toMatchObject({
      code: "ProviderLoginError",
      message: "Provider does not support OAuth login.",
    });
    await expect(service.start({authType: "api_key", providerId: "ambient"})).rejects.toMatchObject({
      code: "ProviderLoginError",
      message: "Provider does not support API key login.",
    });
    expect(current()).toBeNull();
  });

  it("logs out a stored credential, leaving the provider disconnected", async () => {
    const {modelRuntime, service, provider} = await connect();
    await modelRuntime.login("acme", "api_key", {prompt: async () => "sk-stored", notify: () => undefined});

    await service.logout({providerId: "acme"});

    expect(provider("acme")).toMatchObject({connected: false, disconnectable: false});
    expect(await modelRuntime.listCredentials()).toEqual([]);
  });

  it("cancels the login once nobody holds the providers any more", async () => {
    const login = waitingLogin();
    const {release, service, waitForPrompt} = await connect({oauth: login.script});
    await service.start({authType: "oauth", providerId: "acme"});
    await waitForPrompt();

    await release();

    await waitUntil(() => expect(login.aborted()).toBe(true));
  });

  it("cancels the login when the server shuts down", async () => {
    const login = waitingLogin();
    const {server, service, waitForPrompt} = await connect({oauth: login.script});
    await service.start({authType: "oauth", providerId: "acme"});
    await waitForPrompt();

    await server.close();

    expect(login.aborted()).toBe(true);
  });
});
