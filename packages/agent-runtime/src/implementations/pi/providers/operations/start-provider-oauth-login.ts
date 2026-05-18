import {randomUUID} from "node:crypto";
import {Effect} from "effect";
import {ProviderLoginError} from "@supernova/contracts/providers/procedures";
import type {ProviderLoginInputKind} from "@supernova/contracts/providers/schemas";
import {PiSdkService} from "@supernova/agent-runtime/implementations/pi/pi-sdk";
import type {PiSdkServiceShape} from "@supernova/agent-runtime/implementations/pi/pi-sdk";
import {loginSessions, toLoginSession} from "@supernova/agent-runtime/implementations/pi/providers/lib/login-sessions";
import type {LoginSessionState} from "@supernova/agent-runtime/implementations/pi/providers/lib/login-sessions";
import {errorMessage} from "@supernova/agent-runtime/implementations/pi/providers/lib/provider-errors";

interface OAuthPrompt {
  allowEmpty?: boolean;
  message: string;
  placeholder?: string;
}

function waitForInput(state: LoginSessionState, kind: ProviderLoginInputKind, prompt: OAuthPrompt): Promise<string> {
  return new Promise((resolve, reject) => {
    state.status = "waiting_input";
    state.inputKind = kind;
    state.prompt = prompt.message;
    state.placeholder = prompt.placeholder;
    state.allowEmptyInput = prompt.allowEmpty;
    state.waiter = {reject, resolve};
  });
}

async function runOAuthLogin(piSdk: PiSdkServiceShape, state: LoginSessionState): Promise<void> {
  try {
    await piSdk.authStorage.login(state.providerId, {
      onAuth: (info) => {
        state.status = "authenticating";
        state.authUrl = info.url;
        state.instructions = info.instructions;
        state.prompt = undefined;
        state.inputKind = undefined;
        state.placeholder = undefined;
        state.allowEmptyInput = undefined;
      },
      onManualCodeInput: () => waitForInput(state, "manual_code", {message: "Paste the redirect URL or authorization code."}),
      onProgress: (message) => {
        state.progress = message;
      },
      onPrompt: (prompt: OAuthPrompt) => waitForInput(state, "prompt", prompt),
      signal: state.abortController.signal,
    });
    piSdk.modelRegistry.refresh();
    state.status = "succeeded";
    state.progress = "Connected";
    state.waiter = undefined;
  } catch (cause) {
    state.waiter = undefined;
    if (state.abortController.signal.aborted) {
      state.status = "cancelled";
      return;
    }

    state.status = "failed";
    state.error = errorMessage(cause, "Provider login failed.");
  }
}

export function startProviderOAuthLogin(providerId: string) {
  return Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return yield* Effect.try({
      try: () => {
        const provider = piSdk.authStorage.getOAuthProviders().find((candidate) => candidate.id === providerId);
        if (!provider) throw new Error("Provider does not support OAuth login.");

        const session: LoginSessionState = {
          abortController: new AbortController(),
          loginSessionId: randomUUID(),
          providerId,
          providerName: provider.name,
          status: "pending",
        };

        loginSessions.set(session.loginSessionId, session);
        void runOAuthLogin(piSdk, session);
        return toLoginSession(session);
      },
      catch: (cause) => new ProviderLoginError({cause, message: errorMessage(cause, "Failed to start provider login.")}),
    });
  });
}
