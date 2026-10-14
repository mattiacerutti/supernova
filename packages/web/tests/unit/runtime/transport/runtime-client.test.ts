import type {Host} from "@earendil-works/chord";
import {cell, createHost, memoryLinkPair, method, remote} from "@earendil-works/chord";
import {Type} from "typebox";
import {describe, expect, it, onTestFinished} from "vitest";
import {strictJsonMembers} from "@/runtime/transport/runtime-client";

const Echo = remote("test.echo", {
  version: 1,
  input: Type.Object({}),
  variants: {
    default: {
      state: {count: Type.Number()},
      methods: {echo: method(Type.Unsafe<Record<string, unknown> | null>({}), Type.Unknown()), bump: method(Type.Null(), Type.Null())},
    },
  },
});

/** A server serving `Echo` and a browser-kind host connected to it over a memory link, as the app's client is. */
function connect(): {server: Host; browser: Host; reconnect: () => void} {
  const server = createHost({name: "server", onError: () => undefined});
  server.serve(Echo, (_input, _principal, self) => {
    const state = self.state({count: cell(Type.Number(), 0)});
    return {
      kind: "default",
      count: state.count,
      echo: (payload) => payload,
      bump: (_payload, ctx) => {
        state.count.change(ctx, (count) => count + 1);
        return null;
      },
    };
  });
  // The runtime's state lives in its features, which outlive every connection; a hold as the client keeps this record.
  const kept = server.get(Echo, {}, {principal: "owner"});
  const link = () => {
    const [down, up] = memoryLinkPair();
    server.accept(down, {principal: "owner", kind: "client"});
    return {down, up};
  };
  let current = link();
  const browser = createHost({name: "browser", kind: "client", upstream: current.up, onError: () => undefined});
  onTestFinished(async () => {
    kept.release();
    await browser.close();
    await server.close();
  });
  return {
    server,
    browser,
    reconnect: () => {
      current.down.close();
      current = link();
      browser.connect(current.up);
    },
  };
}

describe("the runtime client's handles", () => {
  it("send payloads with undefined fields as strict JSON, and no payload as null", async () => {
    const {browser} = connect();
    const echo = strictJsonMembers(browser.get(Echo, {}, {at: "server"}), "echo");

    expect(await echo.echo({kept: 1, dropped: undefined, nested: {dropped: undefined}})).toEqual({kept: 1, nested: {}});
    expect(await echo.echo(undefined as never)).toBeNull();
  });

  it("follow state across a reconnect: Chord holds the service again and its value arrives anew", async () => {
    const {browser, reconnect} = connect();
    const echo = strictJsonMembers(browser.get(Echo, {}, {at: "server"}), "echo");
    const seen: unknown[] = [];
    const stop = echo.count.subscribe((count) => seen.push(count));
    onTestFinished(stop);

    await echo.bump(null);
    await expect.poll(() => echo.count.value).toBe(1);
    reconnect();
    await echo.bump(null);
    await expect.poll(() => echo.count.value).toBe(2);
    expect(seen[0]).toBeUndefined();
    expect(seen.at(-1)).toBe(2);
  });
});
