import {Effect, Fiber, ManagedRuntime, Stream} from "effect";
import {afterEach, describe, expect, it} from "vitest";
import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import {SessionEventBus, SessionEventBusLive} from "@supernova/agent-runtime/layers/session-runtime/internal/session-event-bus";
import {waitUntil} from "@tests/support/layers/test-utils";

describe("session event bus", () => {
  const runtimes: Array<ManagedRuntime.ManagedRuntime<SessionEventBus, never>> = [];

  afterEach(() => {
    while (runtimes.length > 0) runtimes.pop()?.dispose();
  });

  it("publishes each global event to multiple subscribers", async () => {
    const runtime = ManagedRuntime.make(SessionEventBusLive);
    runtimes.push(runtime);
    const firstEvents: SessionStreamEvent[] = [];
    const secondEvents: SessionStreamEvent[] = [];
    const readyEvent = {revision: 0, sessionId: "ready", type: "session.agent.started"} satisfies SessionStreamEvent;
    const event = {revision: 1, sessionId: "session-1", type: "session.agent.started"} satisfies SessionStreamEvent;

    const first = runtime.runFork(
      Effect.gen(function* () {
        const bus = yield* SessionEventBus;
        yield* Stream.runForEach(bus.stream(), (event) => Effect.sync(() => firstEvents.push(event)));
      })
    );
    const second = runtime.runFork(
      Effect.gen(function* () {
        const bus = yield* SessionEventBus;
        yield* Stream.runForEach(bus.stream(), (event) => Effect.sync(() => secondEvents.push(event)));
      })
    );

    try {
      await waitUntil(
        async () => {
          await runtime.runPromise(
            Effect.gen(function* () {
              const bus = yield* SessionEventBus;
              yield* bus.publish(readyEvent);
            })
          );
          expect(firstEvents).toContainEqual(readyEvent);
          expect(secondEvents).toContainEqual(readyEvent);
        },
        {label: "subscribers to receive readiness event"}
      );
      firstEvents.length = 0;
      secondEvents.length = 0;
      await runtime.runPromise(
        Effect.gen(function* () {
          const bus = yield* SessionEventBus;
          yield* bus.publish(event);
        })
      );

      await waitUntil(() => expect(firstEvents).toEqual([event]));
      await waitUntil(() => expect(secondEvents).toEqual([event]));
    } finally {
      await runtime.runPromise(Effect.all([Fiber.interrupt(first), Fiber.interrupt(second)]).pipe(Effect.ignore));
    }
  });

  it("lets one subscriber unsubscribe without stopping other subscribers", async () => {
    const runtime = ManagedRuntime.make(SessionEventBusLive);
    runtimes.push(runtime);
    const firstEvents: SessionStreamEvent[] = [];
    const secondEvents: SessionStreamEvent[] = [];
    const readyEvent = {revision: 0, sessionId: "ready", type: "session.agent.started"} satisfies SessionStreamEvent;
    const firstEvent = {revision: 1, sessionId: "session-1", type: "session.agent.started"} satisfies SessionStreamEvent;
    const secondEvent = {revision: 2, sessionId: "session-1", type: "session.agent.ended"} satisfies SessionStreamEvent;

    const first = runtime.runFork(
      Effect.gen(function* () {
        const bus = yield* SessionEventBus;
        yield* Stream.runForEach(bus.stream(), (event) => Effect.sync(() => firstEvents.push(event)));
      })
    );
    const second = runtime.runFork(
      Effect.gen(function* () {
        const bus = yield* SessionEventBus;
        yield* Stream.runForEach(bus.stream(), (event) => Effect.sync(() => secondEvents.push(event)));
      })
    );

    try {
      await waitUntil(
        async () => {
          await runtime.runPromise(
            Effect.gen(function* () {
              const bus = yield* SessionEventBus;
              yield* bus.publish(readyEvent);
            })
          );
          expect(firstEvents).toContainEqual(readyEvent);
          expect(secondEvents).toContainEqual(readyEvent);
        },
        {label: "subscribers to receive readiness event"}
      );
      firstEvents.length = 0;
      secondEvents.length = 0;
      await runtime.runPromise(
        Effect.gen(function* () {
          const bus = yield* SessionEventBus;
          yield* bus.publish(firstEvent);
        })
      );
      await waitUntil(() => expect(firstEvents).toEqual([firstEvent]));
      await runtime.runPromise(Fiber.interrupt(first).pipe(Effect.ignore));
      await runtime.runPromise(
        Effect.gen(function* () {
          const bus = yield* SessionEventBus;
          yield* bus.publish(secondEvent);
        })
      );

      await waitUntil(() => expect(secondEvents).toEqual([firstEvent, secondEvent]));
      expect(firstEvents).toEqual([firstEvent]);
    } finally {
      await runtime.runPromise(Effect.all([Fiber.interrupt(first), Fiber.interrupt(second)]).pipe(Effect.ignore));
    }
  });
});
