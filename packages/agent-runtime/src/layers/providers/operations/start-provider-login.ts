import {randomUUID} from "node:crypto";
import type {AuthEvent, AuthPrompt} from "@earendil-works/pi-ai";
import {Effect, Stream} from "effect";
import {ProviderLoginError} from "@supernova/contracts/providers/procedures";
import type {ProviderLoginAuthType} from "@supernova/contracts/providers/procedures";
import type {ProviderLoginStep, ProviderLoginTextInput} from "@supernova/contracts/providers/schemas";
import {PiSdkService} from "@supernova/agent-runtime/layers/pi-sdk";
import type {PiSdkServiceShape} from "@supernova/agent-runtime/layers/pi-sdk";
import {ProviderLoginSessions} from "@supernova/agent-runtime/layers/providers/internal/provider-login-sessions";
import type {ProviderLoginSessionsShape} from "@supernova/agent-runtime/layers/providers/internal/provider-login-sessions";
import {errorMessage} from "@supernova/agent-runtime/layers/providers/lib/provider-errors";

function textInput(prompt: Exclude<AuthPrompt, {type: "select"}>): ProviderLoginTextInput {
  return {
    message: prompt.message,
    placeholder: prompt.placeholder,
    secret: prompt.type === "secret",
  };
}

/** Runs provider-owned authentication while publishing structured login-session updates. */
async function runProviderLogin(
  piSdk: PiSdkServiceShape,
  sessions: ProviderLoginSessionsShape,
  loginSessionId: string,
  providerId: string,
  authType: ProviderLoginAuthType
): Promise<void> {
  let pendingUpdate: Promise<unknown> = Promise.resolve();
  let latestBrowserStep: Extract<ProviderLoginStep, {type: "browser_auth"}> | undefined;

  const enqueueUpdate = (update: Effect.Effect<unknown, unknown>): void => {
    pendingUpdate = pendingUpdate.then(() => Effect.runPromise(update));
  };

  const notify = (event: AuthEvent): void => {
    switch (event.type) {
      case "auth_url":
        latestBrowserStep = {authUrl: event.url, instructions: event.instructions, type: "browser_auth"};
        enqueueUpdate(sessions.updateStep(loginSessionId, latestBrowserStep));
        break;
      case "device_code":
        enqueueUpdate(
          sessions.updateStep(loginSessionId, {
            expiresInSeconds: event.expiresInSeconds,
            intervalSeconds: event.intervalSeconds,
            type: "device_code",
            userCode: event.userCode,
            verificationUri: event.verificationUri,
          })
        );
        break;
      case "info":
        enqueueUpdate(sessions.updateStep(loginSessionId, {links: [...(event.links ?? [])], message: event.message, type: "info"}));
        break;
      case "progress":
        enqueueUpdate(sessions.progress(loginSessionId, event.message));
        break;
    }
  };

  try {
    const signal = await Effect.runPromise(sessions.getAbortSignal(loginSessionId));

    await piSdk.modelRuntime.login(providerId, authType, {
      notify,
      prompt: async (prompt) => {
        await pendingUpdate;

        if (prompt.type === "select") {
          return sessions.waitForInput(loginSessionId, {
            signal: prompt.signal,
            step: {message: prompt.message, options: [...prompt.options], type: "select"},
          });
        }

        if (prompt.type === "manual_code") {
          const input = textInput(prompt);
          const step: ProviderLoginStep = latestBrowserStep
            ? {...latestBrowserStep, manualInput: input}
            : {authUrl: "", instructions: "Complete login in your browser, or enter the requested authorization code below.", manualInput: input, type: "browser_auth"};
          return sessions.waitForInput(loginSessionId, {signal: prompt.signal, step});
        }

        return sessions.waitForInput(loginSessionId, {
          signal: prompt.signal,
          step: {input: textInput(prompt), type: "prompt"},
        });
      },
      signal,
    });
    await pendingUpdate;
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

/** Starts an asynchronous provider-owned authentication session. */
export function startProviderLogin(providerId: string, authType: ProviderLoginAuthType) {
  return Effect.gen(function* () {
    const piSdk = yield* PiSdkService;
    const sessions = yield* ProviderLoginSessions;

    return yield* Effect.tryPromise({
      try: async () => {
        const provider = piSdk.modelRuntime.getProvider(providerId);
        const auth = authType === "oauth" ? provider?.auth.oauth : provider?.auth.apiKey;
        if (!auth?.login) throw new Error(`Provider does not support ${authType === "oauth" ? "OAuth" : "API key"} login.`);

        const loginSessionId = randomUUID();
        await Effect.runPromise(sessions.create({loginSessionId, providerId}));
        void runProviderLogin(piSdk, sessions, loginSessionId, providerId, authType);

        const readySessions = await Effect.runPromise(
          sessions.watch(loginSessionId).pipe(
            Stream.filter((session) => session.step.type !== "starting" && session.step.type !== "authenticating"),
            Stream.take(1),
            Stream.runCollect
          )
        );
        const readySession = readySessions[0];
        if (!readySession) throw new Error("Provider login ended before producing a visible step.");
        return readySession;
      },
      catch: (cause) => new ProviderLoginError({cause, message: errorMessage(cause, "Failed to start provider login.")}),
    });
  });
}
