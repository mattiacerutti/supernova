import {AuthStorage, ModelRegistry} from "@mariozechner/pi-coding-agent";
import type {AgentProviderLoginInputKind, IAgentProviderLoginSession} from "@pi-desktop/contracts/providers";

interface ILoginWaiter {
  reject: (error: Error) => void;
  resolve: (input: string) => void;
}

export interface ILoginSessionState {
  allowEmptyInput?: boolean;
  abortController: AbortController;
  authUrl?: string;
  error?: string;
  inputKind?: AgentProviderLoginInputKind;
  instructions?: string;
  loginSessionId: string;
  placeholder?: string;
  progress?: string;
  prompt?: string;
  providerId: string;
  providerName: string;
  status: IAgentProviderLoginSession["status"];
  waiter?: ILoginWaiter;
}

export const EXTERNAL_AUTH_PROVIDERS = new Set(["amazon-bedrock", "google-vertex"]);
export const authStorage = AuthStorage.create();
export const loginSessions = new Map<string, ILoginSessionState>();
export const modelRegistry = ModelRegistry.create(authStorage);

export function getLoginSessionState(loginSessionId: string): ILoginSessionState {
  const session = loginSessions.get(loginSessionId);
  if (!session) throw new Error("Login session not found.");
  return session;
}

export function toLoginSession(state: ILoginSessionState): IAgentProviderLoginSession {
  return {
    allowEmptyInput: state.allowEmptyInput,
    authUrl: state.authUrl,
    error: state.error,
    inputKind: state.inputKind,
    instructions: state.instructions,
    loginSessionId: state.loginSessionId,
    placeholder: state.placeholder,
    progress: state.progress,
    prompt: state.prompt,
    providerId: state.providerId,
    providerName: state.providerName,
    status: state.status,
  };
}

export function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
