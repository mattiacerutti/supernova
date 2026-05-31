import {randomUUID} from "node:crypto";
import type {OAuthDeviceCodeInfo, OAuthPrompt, OAuthSelectPrompt} from "@earendil-works/pi-ai";
import {Effect} from "effect";
import {ProviderLoginError} from "@supernova/contracts/providers/procedures";
import type {ProviderLoginInputKind} from "@supernova/contracts/providers/schemas";
import {PiSdkService} from "@supernova/agent-runtime/implementations/pi/pi-sdk";
import type {PiSdkServiceShape} from "@supernova/agent-runtime/implementations/pi/pi-sdk";
import {loginSessions, toLoginSession} from "@supernova/agent-runtime/implementations/pi/providers/lib/login-sessions";
import type {LoginSessionState} from "@supernova/agent-runtime/implementations/pi/providers/lib/login-sessions";
import {errorMessage} from "@supernova/agent-runtime/implementations/pi/providers/lib/provider-errors";

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

/** Exposes device-code OAuth instructions through the existing login session shape. */
function setDeviceCode(state: LoginSessionState, info: OAuthDeviceCodeInfo): void {
  state.status = "authenticating";
  state.authUrl = info.verificationUri;
  state.instructions = `Enter code: ${info.userCode}`;
  state.progress = "Waiting for authentication";
  state.prompt = undefined;
  state.inputKind = undefined;
  state.placeholder = undefined;
  state.allowEmptyInput = undefined;
}

/** Uses text input for provider selectors until the shared login contract has native select fields. */
async function waitForSelection(state: LoginSessionState, prompt: OAuthSelectPrompt): Promise<string | undefined> {
  //TODO: Add first-class support for Pi's broader OAuth selector contract.
  // Pi can ask the host application to show structured provider choices
  // during OAuth login. Our provider-login session contract currently
  // only supports URL/instruction/progress fields and free-text input prompts,
  // so this degrades the selector into a text prompt that asks for an option id.
  // Revisit this by adding a structured input kind with option ids/labels to
  // @supernova/contracts, then render those options in the web login UI instead
  // of relying on users to manually type an id from formatted prompt text.
  const options = prompt.options.map((option) => `${option.id}: ${option.label}`).join("\n");
  const input = await waitForInput(state, "prompt", {allowEmpty: true, message: `${prompt.message}\n${options}`, placeholder: "Enter option id"});
  return input || undefined;
}

/** Runs the provider OAuth flow while mutating login-session state for polling clients. */
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
      onDeviceCode: (info) => {
        setDeviceCode(state, info);
      },
      onManualCodeInput: () => waitForInput(state, "manual_code", {message: "Paste the redirect URL or authorization code."}),
      onProgress: (message) => {
        state.progress = message;
      },
      onPrompt: (prompt: OAuthPrompt) => waitForInput(state, "prompt", prompt),
      onSelect: (prompt) => waitForSelection(state, prompt),
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

/** Starts an asynchronous OAuth login session for a provider. */
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
