import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import {Context, Effect, Layer, PubSub, Stream} from "effect";

export interface SessionEventBusShape {
  readonly publish: (event: SessionStreamEvent) => Effect.Effect<void>;
  readonly stream: () => Stream.Stream<SessionStreamEvent>;
}

export class SessionEventBus extends Context.Service<SessionEventBus, SessionEventBusShape>()("supernova/agent-runtime/SessionEventBus") {}

export const SessionEventBusLive = Layer.effect(
  SessionEventBus,
  Effect.gen(function* () {
    const pubSub = yield* PubSub.unbounded<SessionStreamEvent>();

    return {
      publish: (event: SessionStreamEvent) => PubSub.publish(pubSub, event).pipe(Effect.asVoid),
      stream: () => Stream.fromPubSub(pubSub),
    };
  })
);
