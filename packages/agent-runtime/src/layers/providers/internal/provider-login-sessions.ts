import {Context, Effect, Layer, PubSub, Stream} from "effect";
import {ProviderLoginError} from "@supernova/contracts/providers/procedures";
import type {ProviderLoginSession, ProviderLoginStep} from "@supernova/contracts/providers/schemas";
import {errorMessage} from "@supernova/agent-runtime/layers/providers/lib/provider-errors";

interface LoginWaiter {
  readonly reject: (error: Error) => void;
  readonly resolve: (input: string) => void;
}

interface ProviderLoginSessionState {
  readonly abortController: AbortController;
  readonly loginSessionId: string;
  readonly providerId: string;
  progress?: string;
  step: ProviderLoginStep;
  waiter?: LoginWaiter;
}

interface CreateLoginSessionInput {
  readonly loginSessionId: string;
  readonly providerId: string;
}

interface WaitForInputOptions {
  readonly step: ProviderLoginStep;
}

export interface ProviderLoginSessionsShape {
  readonly cancel: (loginSessionId: string) => Effect.Effect<ProviderLoginSession, ProviderLoginError>;
  readonly create: (input: CreateLoginSessionInput) => Effect.Effect<ProviderLoginSession>;
  readonly fail: (loginSessionId: string, error: string) => Effect.Effect<ProviderLoginSession, ProviderLoginError>;
  readonly getAbortSignal: (loginSessionId: string) => Effect.Effect<AbortSignal, ProviderLoginError>;
  readonly progress: (loginSessionId: string, message: string) => Effect.Effect<ProviderLoginSession, ProviderLoginError>;
  readonly succeed: (loginSessionId: string) => Effect.Effect<ProviderLoginSession, ProviderLoginError>;
  readonly submitInput: (loginSessionId: string, input: string) => Effect.Effect<ProviderLoginSession, ProviderLoginError>;
  readonly updateStep: (loginSessionId: string, step: ProviderLoginStep) => Effect.Effect<ProviderLoginSession, ProviderLoginError>;
  readonly waitForInput: (loginSessionId: string, options: WaitForInputOptions) => Promise<string>;
  readonly watch: (loginSessionId: string) => Stream.Stream<ProviderLoginSession, ProviderLoginError>;
}

/** Owns in-flight provider OAuth sessions and broadcasts state changes. */
export class ProviderLoginSessions extends Context.Service<ProviderLoginSessions, ProviderLoginSessionsShape>()("supernova/agent-runtime/ProviderLoginSessions") {}

function toLoginSession(state: ProviderLoginSessionState): ProviderLoginSession {
  return {
    loginSessionId: state.loginSessionId,
    progress: state.progress,
    providerId: state.providerId,
    step: state.step,
  };
}

function getSessionState(sessions: Map<string, ProviderLoginSessionState>, loginSessionId: string): ProviderLoginSessionState {
  const session = sessions.get(loginSessionId);
  if (!session) throw new Error("Login session not found.");
  return session;
}

export const ProviderLoginSessionsLive = Layer.effect(
  ProviderLoginSessions,
  Effect.gen(function* () {
    const sessions = new Map<string, ProviderLoginSessionState>();
    const pubSub = yield* PubSub.unbounded<ProviderLoginSession>();

    const publish = (session: ProviderLoginSession): Effect.Effect<ProviderLoginSession> => PubSub.publish(pubSub, session).pipe(Effect.as(session));

    const update = (loginSessionId: string, apply: (state: ProviderLoginSessionState) => void): Effect.Effect<ProviderLoginSession, ProviderLoginError> =>
      Effect.try({
        try: () => {
          const state = getSessionState(sessions, loginSessionId);
          apply(state);
          return toLoginSession(state);
        },
        catch: (cause) => new ProviderLoginError({cause, message: errorMessage(cause, "Provider login session update failed.")}),
      }).pipe(Effect.flatMap(publish));

    return {
      cancel: (loginSessionId) =>
        update(loginSessionId, (state) => {
          state.abortController.abort();
          state.waiter?.reject(new Error("Login cancelled"));
          state.waiter = undefined;
          state.step = {type: "cancelled"};
        }),
      create: (input) =>
        Effect.sync(() => {
          const state: ProviderLoginSessionState = {
            abortController: new AbortController(),
            loginSessionId: input.loginSessionId,
            providerId: input.providerId,
            step: {type: "starting"},
          };
          sessions.set(input.loginSessionId, state);
          return toLoginSession(state);
        }).pipe(Effect.flatMap(publish)),
      fail: (loginSessionId, error) =>
        update(loginSessionId, (state) => {
          state.step = {error, type: "failed"};
          state.waiter = undefined;
        }),
      getAbortSignal: (loginSessionId) =>
        Effect.try({
          try: () => getSessionState(sessions, loginSessionId).abortController.signal,
          catch: (cause) => new ProviderLoginError({cause, message: errorMessage(cause, "Failed to get provider login cancellation signal.")}),
        }),
      progress: (loginSessionId, message) =>
        update(loginSessionId, (state) => {
          state.progress = message;
        }),
      succeed: (loginSessionId) =>
        update(loginSessionId, (state) => {
          state.progress = "Connected";
          state.step = {type: "succeeded"};
          state.waiter = undefined;
        }),
      submitInput: (loginSessionId, input) =>
        update(loginSessionId, (state) => {
          if (!state.waiter) throw new Error("Login session is not waiting for input.");

          const waiter = state.waiter;
          state.waiter = undefined;
          state.step = {type: "authenticating"};
          waiter.resolve(input);
        }),
      updateStep: (loginSessionId, step) =>
        update(loginSessionId, (state) => {
          state.step = step;
        }),
      waitForInput: (loginSessionId, options) =>
        new Promise((resolve, reject) => {
          void Effect.runPromise(
            update(loginSessionId, (state) => {
              state.step = options.step;
              state.waiter = {reject, resolve};
            })
          ).catch(reject);
        }),
      watch: (loginSessionId) =>
        Stream.concat(
          Stream.fromEffect(
            Effect.try({
              try: () => toLoginSession(getSessionState(sessions, loginSessionId)),
              catch: (cause) => new ProviderLoginError({cause, message: errorMessage(cause, "Failed to watch provider login session.")}),
            })
          ),
          Stream.fromPubSub(pubSub).pipe(Stream.filter((session) => session.loginSessionId === loginSessionId))
        ),
    };
  })
);
