import {ProviderLoginError} from "@supernova/contracts/providers/procedures";
import type {ProviderLoginSession, ProviderLoginStep} from "@supernova/contracts/providers/schemas";
import {EventBus} from "@supernova/agent-runtime/lib/event-bus";

interface LoginWaiter {
  readonly cleanup: () => void;
  readonly reject: (error: Error) => void;
  readonly resolve: (input: string) => void;
}

interface LoginSessionState {
  readonly abortController: AbortController;
  readonly loginSessionId: string;
  readonly providerId: string;
  progress?: string;
  step: ProviderLoginStep;
  waiter?: LoginWaiter;
}

interface WaitForInputOptions {
  readonly signal?: AbortSignal;
  readonly step: ProviderLoginStep;
}

function toLoginSession(state: LoginSessionState): ProviderLoginSession {
  return {loginSessionId: state.loginSessionId, progress: state.progress, providerId: state.providerId, step: state.step};
}

/** In-flight provider logins. Each mutation publishes the new state to every watcher of that session. */
export class LoginSessions {
  private readonly sessions = new Map<string, LoginSessionState>();
  private readonly changes = new EventBus<ProviderLoginSession>();

  public create(input: {readonly loginSessionId: string; readonly providerId: string}): ProviderLoginSession {
    const state: LoginSessionState = {abortController: new AbortController(), loginSessionId: input.loginSessionId, providerId: input.providerId, step: {type: "starting"}};
    this.sessions.set(input.loginSessionId, state);
    return this.publish(state);
  }

  public get(loginSessionId: string): ProviderLoginSession {
    return toLoginSession(this.state(loginSessionId));
  }

  public abortSignal(loginSessionId: string): AbortSignal {
    return this.state(loginSessionId).abortController.signal;
  }

  public cancel(loginSessionId: string): ProviderLoginSession {
    return this.update(loginSessionId, (state) => {
      state.abortController.abort();
      state.waiter?.cleanup();
      state.waiter?.reject(new Error("Login cancelled"));
      state.waiter = undefined;
      state.step = {type: "cancelled"};
    });
  }

  public fail(loginSessionId: string, error: string): ProviderLoginSession {
    return this.update(loginSessionId, (state) => {
      state.step = {error, type: "failed"};
      state.waiter?.cleanup();
      state.waiter = undefined;
    });
  }

  public progress(loginSessionId: string, message: string): ProviderLoginSession {
    return this.update(loginSessionId, (state) => {
      state.progress = message;
    });
  }

  public succeed(loginSessionId: string): ProviderLoginSession {
    return this.update(loginSessionId, (state) => {
      state.progress = "Connected";
      state.step = {type: "succeeded"};
      state.waiter?.cleanup();
      state.waiter = undefined;
    });
  }

  public submitInput(loginSessionId: string, input: string): ProviderLoginSession {
    return this.update(loginSessionId, (state) => {
      if (!state.waiter) throw new ProviderLoginError({message: "Login session is not waiting for input."});

      const waiter = state.waiter;
      state.waiter = undefined;
      state.step = {type: "authenticating"};
      waiter.cleanup();
      waiter.resolve(input);
    });
  }

  public updateStep(loginSessionId: string, step: ProviderLoginStep): ProviderLoginSession {
    return this.update(loginSessionId, (state) => {
      state.step = step;
    });
  }

  /** Shows `step` to the client and resolves with what the user submits, or rejects when the login is aborted. */
  public waitForInput(loginSessionId: string, options: WaitForInputOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      this.update(loginSessionId, (state) => {
        const abort = () => {
          if (state.waiter?.resolve !== resolve) return;
          state.waiter = undefined;
          reject(new Error("Login prompt cancelled"));
        };
        const cleanup = () => options.signal?.removeEventListener("abort", abort);

        state.step = options.step;
        state.waiter = {cleanup, reject, resolve};
        options.signal?.addEventListener("abort", abort, {once: true});
        if (options.signal?.aborted) abort();
      });
    });
  }

  /** The current state followed by every later change, until the consumer stops iterating. Subscribes immediately. */
  public watch(loginSessionId: string): AsyncGenerator<ProviderLoginSession, void, undefined> {
    const current = this.get(loginSessionId);
    const changes = this.changes.subscribe();
    let started = false;

    const next = async (): Promise<IteratorResult<ProviderLoginSession, void>> => {
      if (!started) {
        started = true;
        return {done: false, value: current};
      }
      for (let result = await changes.next(); !result.done; result = await changes.next()) {
        if (result.value.loginSessionId === loginSessionId) return result;
      }
      return {done: true, value: undefined};
    };

    return {
      next,
      return: () => changes.return(),
      throw: (error) => changes.throw(error),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }

  private state(loginSessionId: string): LoginSessionState {
    const session = this.sessions.get(loginSessionId);
    if (!session) throw new ProviderLoginError({message: "Login session not found."});
    return session;
  }

  private update(loginSessionId: string, apply: (state: LoginSessionState) => void): ProviderLoginSession {
    const state = this.state(loginSessionId);
    apply(state);
    return this.publish(state);
  }

  private publish(state: LoginSessionState): ProviderLoginSession {
    const session = toLoginSession(state);
    this.changes.publish(session);
    return session;
  }
}
