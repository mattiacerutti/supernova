import type {AuthEvent, AuthPrompt} from "@earendil-works/pi-ai";
import type {ProviderLoginAuthType} from "@supernova/contracts/providers/procedures";
import type {ProviderLoginStep, ProviderLoginTextInput} from "@supernova/contracts/providers/schemas";
import type {LoginSessions} from "@supernova/agent-runtime/features/providers/login/login-sessions";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";

function textInput(prompt: Exclude<AuthPrompt, {type: "select"}>): ProviderLoginTextInput {
  return {
    message: prompt.message,
    placeholder: prompt.placeholder,
    secret: prompt.type === "secret",
  };
}

/** Runs provider-owned authentication while publishing structured login-session updates. */
export async function runProviderLogin(
  sdk: Pick<PiSdk, "modelRuntime">,
  sessions: LoginSessions,
  loginSessionId: string,
  providerId: string,
  authType: ProviderLoginAuthType
): Promise<void> {
  let latestBrowserStep: Extract<ProviderLoginStep, {type: "browser_auth"}> | undefined;

  const notify = (event: AuthEvent): void => {
    switch (event.type) {
      case "auth_url":
        latestBrowserStep = {authUrl: event.url, instructions: event.instructions, type: "browser_auth"};
        sessions.updateStep(loginSessionId, latestBrowserStep);
        break;
      case "device_code":
        sessions.updateStep(loginSessionId, {
          expiresInSeconds: event.expiresInSeconds,
          intervalSeconds: event.intervalSeconds,
          type: "device_code",
          userCode: event.userCode,
          verificationUri: event.verificationUri,
        });
        break;
      case "info":
        sessions.updateStep(loginSessionId, {links: [...(event.links ?? [])], message: event.message, type: "info"});
        break;
      case "progress":
        sessions.progress(loginSessionId, event.message);
        break;
    }
  };

  try {
    await sdk.modelRuntime.login(providerId, authType, {
      notify,
      prompt: async (prompt) => {
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
      signal: sessions.abortSignal(loginSessionId),
    });
    sessions.succeed(loginSessionId);
  } catch (cause) {
    if (sessions.abortSignal(loginSessionId).aborted) {
      sessions.cancel(loginSessionId);
      return;
    }
    sessions.fail(loginSessionId, errorMessage(cause, "Provider login failed."));
  }
}
