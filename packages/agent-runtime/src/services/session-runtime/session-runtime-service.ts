import {Context, Effect} from "effect";
import type {Stream} from "effect";
import type {CompactSessionPayload, SendMessagePayload, SessionStreamEvent} from "@supernova/contracts/sessions/procedures";

export interface SessionRuntimeServiceShape {
  readonly abortSession: (sessionId: string) => Effect.Effect<void>;
  readonly compactSession: (input: CompactSessionPayload) => Effect.Effect<void>;
  readonly sendMessage: (input: SendMessagePayload) => Effect.Effect<void>;
  readonly watchEvents: () => Stream.Stream<SessionStreamEvent>;
}

/** Owns long-lived agent session runtimes and their observable event stream. */
export class SessionRuntimeService extends Context.Service<SessionRuntimeService, SessionRuntimeServiceShape>()("supernova/agent-runtime/SessionRuntimeService") {}
