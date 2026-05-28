import {Effect, Fiber, ManagedRuntime, Stream} from "effect";
import {afterEach, describe, expect, it} from "vitest";
import type {SessionStreamEvent} from "@supernova/contracts/sessions/procedures";
import {SessionEventBus, SessionEventBusLive} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/session-event-bus";
import {waitUntil} from "@tests/implementations/pi/sessions/pi-session-test-utils";

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

    await new Promise((resolve) => setTimeout(resolve, 0));
    await runtime.runPromise(
      Effect.gen(function* () {
        const bus = yield* SessionEventBus;
        yield* bus.publish(event);
      })
    );

    await waitUntil(() => expect(firstEvents).toEqual([event]));
    await waitUntil(() => expect(secondEvents).toEqual([event]));
    await runtime.runPromise(Effect.all([Fiber.interrupt(first), Fiber.interrupt(second)]).pipe(Effect.ignore));
  });

  it("lets one subscriber unsubscribe without stopping other subscribers", async () => {
    const runtime = ManagedRuntime.make(SessionEventBusLive);
    runtimes.push(runtime);
    const firstEvents: SessionStreamEvent[] = [];
    const secondEvents: SessionStreamEvent[] = [];
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

    await new Promise((resolve) => setTimeout(resolve, 0));
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
    await runtime.runPromise(Fiber.interrupt(second).pipe(Effect.ignore));
  });
});
