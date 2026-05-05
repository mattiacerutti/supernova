import {randomUUID} from "node:crypto";
import {Effect} from "effect";
import {AgentProviderLoginError} from "@pi-desktop/contracts/providers";
import type {AgentProviderLoginInputKind} from "@pi-desktop/contracts/providers";
import {authStorage, errorMessage, loginSessions, modelRegistry, toLoginSession} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/pi-provider-runtime";
import type {ILoginSessionState} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/pi-provider-runtime";

interface IOAuthPrompt {
  allowEmpty?: boolean;
  message: string;
  placeholder?: string;
}

function waitForInput(state: ILoginSessionState, kind: AgentProviderLoginInputKind, prompt: IOAuthPrompt): Promise<string> {
  return new Promise((resolve, reject) => {
    state.status = "waiting_input";
    state.inputKind = kind;
    state.prompt = prompt.message;
    state.placeholder = prompt.placeholder;
    state.allowEmptyInput = prompt.allowEmpty;
    state.waiter = {reject, resolve};
  });
}

async function runOAuthLogin(state: ILoginSessionState): Promise<void> {
  try {
    await authStorage.login(state.providerId, {
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
      onPrompt: (prompt: IOAuthPrompt) => waitForInput(state, "prompt", prompt),
      signal: state.abortController.signal,
    });
    modelRegistry.refresh();
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
  return Effect.try({
    try: () => {
      const provider = authStorage.getOAuthProviders().find((candidate) => candidate.id === providerId);
      if (!provider) throw new Error("Provider does not support OAuth login.");

      const session: ILoginSessionState = {
        abortController: new AbortController(),
        loginSessionId: randomUUID(),
        providerId,
        providerName: provider.name,
        status: "pending",
      };

      loginSessions.set(session.loginSessionId, session);
      void runOAuthLogin(session);
      return toLoginSession(session);
    },
    catch: (cause) => new AgentProviderLoginError({cause, message: errorMessage(cause, "Failed to start provider login.")}),
  });
}
