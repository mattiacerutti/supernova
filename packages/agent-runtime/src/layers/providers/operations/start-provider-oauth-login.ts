import {randomUUID} from "node:crypto";
import type {OAuthDeviceCodeInfo, OAuthPrompt, OAuthSelectPrompt} from "@earendil-works/pi-ai";
import {Effect} from "effect";
import {ProviderLoginError} from "@supernova/contracts/providers/procedures";
import type {ProviderLoginStep, ProviderLoginTextInput} from "@supernova/contracts/providers/schemas";
import {PiSdkService} from "@supernova/agent-runtime/layers/pi-sdk";
import type {PiSdkServiceShape} from "@supernova/agent-runtime/layers/pi-sdk";
import {ProviderLoginSessions} from "@supernova/agent-runtime/layers/providers/internal/provider-login-sessions";
import type {ProviderLoginSessionsShape} from "@supernova/agent-runtime/layers/providers/internal/provider-login-sessions";
import {errorMessage} from "@supernova/agent-runtime/layers/providers/lib/provider-errors";

function textInput(prompt: OAuthPrompt): ProviderLoginTextInput {
  return {allowEmpty: prompt.allowEmpty, message: prompt.message, placeholder: prompt.placeholder};
}

/** Maps Pi device-code metadata into a structured login step. */
function deviceCodeStep(info: OAuthDeviceCodeInfo): ProviderLoginStep {
  return {
    expiresInSeconds: info.expiresInSeconds,
    intervalSeconds: info.intervalSeconds,
    type: "device_code",
    userCode: info.userCode,
    verificationUri: info.verificationUri,
  };
}

/** Runs the provider OAuth flow while publishing structured login-session updates. */
async function runOAuthLogin(piSdk: PiSdkServiceShape, sessions: ProviderLoginSessionsShape, loginSessionId: string, providerId: string): Promise<void> {
  let pendingUpdate: Promise<unknown> = Promise.resolve();
  const enqueueUpdate = (update: Effect.Effect<unknown, unknown>): void => {
    pendingUpdate = pendingUpdate.then(() => Effect.runPromise(update));
  };

  try {
    const signal = await Effect.runPromise(sessions.getAbortSignal(loginSessionId));
    let latestBrowserStep: Extract<ProviderLoginStep, {type: "browser_auth"}> | undefined;

    await piSdk.authStorage.login(providerId, {
      onAuth: (info) => {
        latestBrowserStep = {authUrl: info.url, instructions: info.instructions, type: "browser_auth"};
        enqueueUpdate(sessions.updateStep(loginSessionId, latestBrowserStep));
      },
      onDeviceCode: (info) => {
        enqueueUpdate(sessions.updateStep(loginSessionId, deviceCodeStep(info)));
      },
      onManualCodeInput: async () => {
        await pendingUpdate;
        const input = textInput({
          message: "If the browser is on another machine, paste the final redirect URL or authorization code.",
          placeholder: "Redirect URL or authorization code",
        });
        const step: ProviderLoginStep =
          latestBrowserStep !== undefined
            ? {...latestBrowserStep, manualInput: input}
            : {authUrl: "", instructions: "Complete login in your browser, or paste the final redirect URL/code below.", manualInput: input, type: "browser_auth"};
        return sessions.waitForInput(loginSessionId, {step});
      },
      onProgress: (message) => {
        enqueueUpdate(sessions.progress(loginSessionId, message));
      },
      onPrompt: async (prompt: OAuthPrompt) => {
        await pendingUpdate;
        return sessions.waitForInput(loginSessionId, {step: {input: textInput(prompt), type: "prompt"}});
      },
      onSelect: async (prompt: OAuthSelectPrompt) => {
        await pendingUpdate;
        const input = await sessions.waitForInput(loginSessionId, {
          step: {message: prompt.message, options: prompt.options, type: "select"},
        });
        return input || undefined;
      },
      signal,
    });
    await pendingUpdate;
    piSdk.modelRegistry.refresh();
    await Effect.runPromise(sessions.succeed(loginSessionId));
  } catch (cause) {
    await pendingUpdate.catch(() => undefined);
    const signal = await Effect.runPromise(sessions.getAbortSignal(loginSessionId));
    if (signal.aborted) {
      await Effect.runPromise(sessions.cancel(loginSessionId));
      return;
    }

    await Effect.runPromise(sessions.fail(loginSessionId, errorMessage(cause, "Provider login failed.")));
  }
}

/** Starts an asynchronous OAuth login session for a provider. */
export function startProviderOAuthLogin(providerId: string) {
  return Effect.gen(function* () {
    const piSdk = yield* PiSdkService;
    const sessions = yield* ProviderLoginSessions;

    return yield* Effect.tryPromise({
      try: async () => {
        const provider = piSdk.authStorage.getOAuthProviders().find((candidate) => candidate.id === providerId);
        if (!provider) throw new Error("Provider does not support OAuth login.");

        const loginSessionId = randomUUID();
        const session = await Effect.runPromise(sessions.create({loginSessionId, providerId}));
        void runOAuthLogin(piSdk, sessions, loginSessionId, providerId);
        return session;
      },
      catch: (cause) => new ProviderLoginError({cause, message: errorMessage(cause, "Failed to start provider login.")}),
    });
  });
}
