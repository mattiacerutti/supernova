import type {ProviderLoginInputKind, ProviderLoginSession} from "@supernova/contracts/providers/schemas";

interface LoginWaiter {
  reject: (error: Error) => void;
  resolve: (input: string) => void;
}

export interface LoginSessionState {
  allowEmptyInput?: boolean;
  abortController: AbortController;
  authUrl?: string;
  error?: string;
  inputKind?: ProviderLoginInputKind;
  instructions?: string;
  loginSessionId: string;
  placeholder?: string;
  progress?: string;
  prompt?: string;
  providerId: string;
  providerName: string;
  status: ProviderLoginSession["status"];
  waiter?: LoginWaiter;
}

export const loginSessions = new Map<string, LoginSessionState>();

/** Gets mutable login-session state or throws when the session is gone. */
export function getLoginSessionState(loginSessionId: string): LoginSessionState {
  const session = loginSessions.get(loginSessionId);
  if (!session) throw new Error("Login session not found.");
  return session;
}

/** Maps internal login-session state to the shared provider login-session contract. */
export function toLoginSession(state: LoginSessionState): ProviderLoginSession {
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
