import {InMemoryCredentialStore} from "@earendil-works/pi-ai";
import {ModelRuntime} from "@earendil-works/pi-coding-agent";
import type {LoginState} from "@supernova/contracts/services/providers/schemas";
import {describe, expect, it} from "vitest";
import {Logins} from "@supernova/agent-runtime/features/providers/natives/logins";
import {waitUntil} from "@tests/support/async";

describe("provider logins", () => {
  it("ends a login nobody finishes once its deadline passes, aborting the provider's flow", async () => {
    let signal: AbortSignal | undefined;
    const modelRuntime = await ModelRuntime.create({credentials: new InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false});
    modelRuntime.registerNativeProvider({
      id: "acme",
      name: "Acme",
      getModels: () => [],
      stream: () => {
        throw new Error("Acme has no models.");
      },
      streamSimple: () => {
        throw new Error("Acme has no models.");
      },
      auth: {
        apiKey: {
          name: "Acme API key",
          login: async (interaction) => {
            signal = interaction.signal;
            return {type: "api_key", key: await interaction.prompt({type: "secret", message: "API key"})};
          },
          resolve: async () => undefined,
        },
      },
    });
    let state: LoginState | null = null;
    const logins = new Logins({
      sdk: {modelRuntime},
      login: {
        get value() {
          return state;
        },
        set: (value) => void (state = value),
      },
      credentialsChanged: async () => undefined,
      timeoutMs: 50,
    });

    logins.start("acme", "api_key");
    await waitUntil(() => expect(state?.status).toBe("error"));

    expect(state).toMatchObject({status: "error", message: "The login timed out.", prompt: null});
    expect(signal?.aborted).toBe(true);
    expect(() => logins.start("acme", "api_key")).not.toThrow();
    await logins.close();
  });
});
