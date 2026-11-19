import {randomUUID} from "node:crypto";
import type {AuthEvent, AuthPrompt} from "@earendil-works/pi-ai";
import {ProviderLoginError} from "@supernova/contracts/services/providers/procedures";
import type {LoginNotice, LoginPrompt, LoginState, ProviderLoginAuthType} from "@supernova/contracts/services/providers/schemas";
import type {Published} from "@supernova/agent-runtime/lib/chord/state";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";
import {loadPiSettings} from "@supernova/agent-runtime/pi/config/settings";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";

interface Attempt {
  readonly id: string;
  readonly controller: AbortController;
  readonly prompts: Map<string, {readonly prompt: LoginPrompt; readonly resolve: (value: string) => void}>;
  done: Promise<void>;
}

export interface LoginsDeps {
  readonly sdk: Pick<PiSdk, "modelRuntime">;
  readonly login: Published<LoginState | null>;
  readonly credentialsChanged: () => Promise<void>;
  readonly timeoutMs?: number;
}

export class Logins {
  private readonly deps: LoginsDeps;
  private active: Attempt | undefined;
  private closed = false;

  public constructor(deps: LoginsDeps) {
    this.deps = deps;
  }

  public start(providerId: string, authType: ProviderLoginAuthType): string {
    if (this.active) throw new ProviderLoginError({message: "A provider login is already in progress; cancel it first."});
    const provider = this.deps.sdk.modelRuntime.getProvider(providerId);
    const auth = authType === "oauth" ? provider?.auth.oauth : provider?.auth.apiKey;
    if (!auth?.login) throw new ProviderLoginError({message: `Provider does not support ${authType === "oauth" ? "OAuth" : "API key"} login.`});

    const attempt: Attempt = {id: randomUUID(), controller: new AbortController(), prompts: new Map(), done: Promise.resolve()};
    this.active = attempt;
    this.deps.login.set({attemptId: attempt.id, providerId, authType, status: "working", prompt: null, notices: []});
    attempt.done = this.run(attempt, providerId, authType);
    return attempt.id;
  }

  public answer(attemptId: string, promptId: string, value: string): void {
    const pending = this.attempt(attemptId).prompts.get(promptId);
    if (!pending) throw new ProviderLoginError({message: "This login question was already answered."});
    if (pending.prompt.type === "select" && !pending.prompt.options.some((option) => option.id === value)) {
      throw new ProviderLoginError({message: "Select one of the listed options."});
    }
    pending.resolve(value);
  }

  public async cancel(attemptId: string): Promise<void> {
    if (this.active?.id !== attemptId) return;
    this.active.controller.abort();
    await this.active.done;
  }

  public dismiss(attemptId: string): void {
    const login = this.deps.login.value;
    if (login?.attemptId === attemptId && login.status !== "working") this.deps.login.set(null);
  }

  public async logout(providerId: string): Promise<void> {
    if (this.active) throw new ProviderLoginError({message: "Cancel the login in progress before removing a credential."});
    await this.deps.sdk.modelRuntime.logout(providerId);
    await this.deps.credentialsChanged();
  }

  public async close(): Promise<void> {
    // Chord refuses writes once the object that published the state has ended.
    this.closed = true;
    this.active?.controller.abort();
    await this.active?.done;
  }

  private attempt(attemptId: string): Attempt {
    if (this.active?.id !== attemptId) throw new ProviderLoginError({message: "This login is no longer active."});
    return this.active;
  }

  private async run(attempt: Attempt, providerId: string, authType: ProviderLoginAuthType): Promise<void> {
    const signal = AbortSignal.any([attempt.controller.signal, AbortSignal.timeout(this.deps.timeoutMs ?? 600_000)]);
    try {
      await this.deps.sdk.modelRuntime.login(
        providerId,
        authType,
        {
          signal,
          prompt: (prompt) => this.prompt(attempt, prompt, signal),
          notify: (event) => {
            if (!signal.aborted) this.update(attempt, (login) => ({...login, notices: [...login.notices, toNotice(event)]}));
          },
        },
        {getDeviceId: () => loadPiSettings().getOrCreateDeviceId()}
      );
      // The credential is stored either way; a stale list only shows until the next change.
      if (!this.closed) await this.deps.credentialsChanged().catch((error: unknown) => console.error("[runtime] Listing providers after a login failed:", error));
      this.finish(attempt, "success", "Connected.");
    } catch (cause) {
      if (attempt.controller.signal.aborted) this.finish(attempt, "cancelled", "Login cancelled.");
      else if (signal.aborted) this.finish(attempt, "error", "The login timed out.");
      else this.finish(attempt, "error", errorMessage(cause, "Provider login failed."));
    } finally {
      // Withdraws a question still open after the provider's own callback finished the login.
      attempt.controller.abort();
      if (this.active === attempt) this.active = undefined;
    }
  }

  private prompt(attempt: Attempt, input: AuthPrompt, whole: AbortSignal): Promise<string> {
    const signal = input.signal ? AbortSignal.any([whole, input.signal]) : whole;
    if (signal.aborted) return Promise.reject(signal.reason);
    const prompt = toPrompt(input);
    return new Promise((resolve, reject) => {
      const close = () => {
        signal.removeEventListener("abort", abort);
        attempt.prompts.delete(prompt.id);
        this.update(attempt, (login) => (login.prompt?.id === prompt.id ? {...login, prompt: null} : login));
      };
      const abort = () => {
        close();
        reject(signal.reason);
      };
      attempt.prompts.set(prompt.id, {prompt, resolve: (value) => (close(), resolve(value))});
      signal.addEventListener("abort", abort, {once: true});
      this.update(attempt, (login) => ({...login, prompt}));
    });
  }

  private finish(attempt: Attempt, status: Exclude<LoginState["status"], "working">, message: string): void {
    this.update(attempt, (login) => ({...login, status, prompt: null, message}));
  }

  private update(attempt: Attempt, change: (login: LoginState) => LoginState): void {
    const login = this.deps.login.value;
    if (!this.closed && login?.attemptId === attempt.id) this.deps.login.set(change(login));
  }
}

// Providers leave optional fields undefined, which documents reject.
const defined = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;

function toPrompt(prompt: AuthPrompt): LoginPrompt {
  const id = randomUUID();
  if (prompt.type === "select") {
    return {id, type: "select", message: prompt.message, options: prompt.options.map((option) => defined({id: option.id, label: option.label, description: option.description}))};
  }
  return defined({id, type: prompt.type, message: prompt.message, placeholder: prompt.placeholder});
}

function toNotice(event: AuthEvent): LoginNotice {
  switch (event.type) {
    case "info":
      return defined({type: "info", message: event.message, links: event.links?.map((link) => defined({url: link.url, label: link.label}))});
    case "auth_url":
      return defined({type: "auth_url", url: event.url, instructions: event.instructions});
    case "device_code":
      return defined({type: "device_code", userCode: event.userCode, verificationUri: event.verificationUri, expiresInSeconds: event.expiresInSeconds});
    case "progress":
      return {type: "progress", message: event.message};
  }
}
