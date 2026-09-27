import {describe, expect, it} from "vitest";
import {EventBus} from "@supernova/agent-runtime/lib/event-bus";
import {waitUntil} from "@tests/support/async";

async function collect<T>(iterable: AsyncIterable<T>, into: T[]): Promise<void> {
  for await (const value of iterable) into.push(value);
}

describe("event bus", () => {
  it("delivers each value to every active subscriber, in order", async () => {
    const bus = new EventBus<number>();
    const first: number[] = [];
    const second: number[] = [];
    const firstSubscription = bus.subscribe();
    const secondSubscription = bus.subscribe();
    const pumps = [collect(firstSubscription, first), collect(secondSubscription, second)];

    bus.publish(1);
    bus.publish(2);
    await waitUntil(() => expect(first).toEqual([1, 2]));
    await waitUntil(() => expect(second).toEqual([1, 2]));

    await firstSubscription.return();
    await secondSubscription.return();
    await Promise.all(pumps);
  });

  it("stops delivering to a subscriber once it returns, without affecting the others", async () => {
    const bus = new EventBus<string>();
    const kept: string[] = [];
    const dropped: string[] = [];
    const keptSubscription = bus.subscribe();
    const droppedSubscription = bus.subscribe();
    const pumps = [collect(keptSubscription, kept), collect(droppedSubscription, dropped)];

    bus.publish("a");
    await waitUntil(() => expect(dropped).toEqual(["a"]));
    await droppedSubscription.return();

    bus.publish("b");
    await waitUntil(() => expect(kept).toEqual(["a", "b"]));
    expect(dropped).toEqual(["a"]);

    await keptSubscription.return();
    await Promise.all(pumps);
  });

  it("does not replay values published before a subscription started", async () => {
    const bus = new EventBus<number>();
    bus.publish(1);
    const late: number[] = [];
    const subscription = bus.subscribe();
    const pump = collect(subscription, late);

    bus.publish(2);
    await waitUntil(() => expect(late).toEqual([2]));

    await subscription.return();
    await pump;
  });

  it("wakes a consumer blocked on next() when the subscription is returned", async () => {
    const bus = new EventBus<number>();
    const subscription = bus.subscribe();
    const pending = subscription.next();

    await subscription.return();

    await expect(pending).resolves.toEqual({done: true, value: undefined});
  });
});
