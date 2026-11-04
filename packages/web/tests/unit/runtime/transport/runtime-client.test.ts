import type {Host, Link} from "@earendil-works/chord";
import {createHost, defineFacet, defineState, local, memoryLinkPair, method, num, obj, remote, unknown} from "@earendil-works/chord";
import type {Schema} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {describe, expect, it, onTestFinished} from "vitest";
import {follow} from "@/runtime/transport/follow";
import {strictJsonMembers} from "@/runtime/transport/runtime-client";

type P = {readonly kind: string};

const Echo = remote("test.echo", {
  version: 1,
  params: {},
  hostAddress: () => ({kind: "server", params: {}, key: "server"}),
  variants: {
    owner: {
      state: {count: num()},
      methods: {echo: method(unknown() as Schema<Record<string, unknown> | null>, unknown()), bump: method()},
    },
  },
});

const Count = defineState("test.count", {schema: obj({count: num()}), version: 1, initial: () => ({count: 0})});

const Counter = local("test.counter", {version: 1, params: {}, members: {count: obj({count: num()}), bump: method()}});

async function connect(): Promise<{browser: Host<P>; reconnect: () => void}> {
  const server = createHost<P>({address: {kind: "server", params: {}, key: "server"}, principal: {kind: "server"}, onError: () => undefined});
  await server.load(
    [
      {
        name: "test",
        facet: defineFacet<P>((host) => {
          host.serve(Counter, (_params, self) => {
            const count = self.state(Count);
            return {
              count,
              bump: async (ctx) => {
                await count.change((draft) => void (draft.count += 1), ctx);
                return null;
              },
            };
          });
          host.serve(Echo, (_params, _principal, self) => {
            const counter = self.get(Counter, {});
            return {
              variant: "owner",
              members: {
                count: self.derive([counter.count], ([value]) => value.count),
                echo: async (payload) => payload,
                bump: (ctx) => counter.bump(ctx),
              },
            };
          });
        }),
      },
    ],
    context
  );
  let current: Link | undefined;
  const link = (): Link => {
    const [down, up] = memoryLinkPair();
    server.accept(down, {principal: {kind: "owner"}}, context);
    current = down;
    return up;
  };
  const browser = createHost<P>({onError: () => undefined});
  browser.connect(link(), {principal: {kind: "server"}}, context);
  await browser.load([], context);
  onTestFinished(async () => {
    await browser.close(context);
    await server.close(context);
  });
  return {
    browser,
    // As the app's client does: a new link once the old one's close reached the host.
    reconnect: () => {
      current?.close();
      queueMicrotask(() => browser.connect(link(), {principal: {kind: "server"}}, context));
    },
  };
}

describe("the runtime client's references", () => {
  it("send payloads with undefined fields as strict JSON, and call a method without arguments with only a context", async () => {
    const {browser} = await connect();
    const held = await browser.get(Echo, {}, context);
    const echo = strictJsonMembers(held, "echo") as unknown as {echo(payload: unknown): Promise<unknown>; bump(): Promise<null>};

    expect(await echo.echo({kept: 1, dropped: undefined, nested: {dropped: undefined}})).toEqual({kept: 1, nested: {}});
    expect(await echo.echo(undefined)).toBeNull();
    expect(await echo.bump()).toBeNull();
  });

  it("follow state across a reconnect: Chord holds the object again and its value arrives anew", async () => {
    const {browser, reconnect} = await connect();
    const held = await browser.get(Echo, {}, context);
    const seen: number[] = [];
    const stop = follow(held.count, (count) => seen.push(count));
    onTestFinished(stop);

    await held.bump(context);
    await expect.poll(() => held.count.value).toBe(1);
    reconnect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await held.bump(context);
    await expect.poll(() => held.count.value).toBe(2);
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(2);
  });

  it("deliver a value that lands while the watch is acquired, once", async () => {
    const {browser} = await connect();
    const held = await browser.get(Echo, {}, context);
    const seen: number[] = [];
    const stop = follow(held.count, (count) => seen.push(count));
    onTestFinished(stop);
    // Before the watch resolves: its starting value already holds the change.
    await held.bump(context);

    await expect.poll(() => seen.at(-1)).toBe(1);
    expect(seen).toEqual([0, 1]);
  });
});
