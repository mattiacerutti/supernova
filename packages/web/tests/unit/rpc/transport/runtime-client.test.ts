import {createRemoteServiceBinding, defineService, RemoteServiceProvider} from "@earendil-works/chord";
import type {Context, RemoteServiceTransport} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {encodeClientMessage} from "@earendil-works/pi-protocol";
import {describe, expect, it, vi} from "vitest";
import {strictJsonTransport} from "@/rpc/transport/runtime-client";

interface Echo {
  echo(text: string, context: Context): Promise<string>;
}

const Echo = defineService<Echo>("test.echo");

/** A Chord facade over a provider in the same process: the object the runtime client exposes for each service. */
function facade(calls: string[]): Echo {
  const provider = new RemoteServiceProvider([Echo]);
  provider.provide(Echo, {echo: async (text) => text});
  const transport: RemoteServiceTransport = {
    invoke: (call, context) => {
      calls.push(call.member);
      return provider.invoke(call, context);
    },
    subscribe: async (serviceId, mode, listener) => {
      const subscription = provider.subscribe(serviceId, mode, listener);
      return {snapshot: subscription.snapshot, activate: () => subscription.activate(), close: () => subscription.close()};
    },
  };
  return createRemoteServiceBinding({services: [Echo], transport}).use(Echo);
}

describe("runtime service facades", () => {
  it("call the server with the caller's context", async () => {
    const calls: string[] = [];
    expect(await facade(calls).echo("hi", BACKGROUND_CONTEXT)).toBe("hi");
    expect(calls).toEqual(["echo"]);
  });

  // Chord's facades answer every member, `then` included; a promise resolved with one calls a remote `then`. That
  // is why the attachment record, not the controller, is what promises resolve with (see `attached` in the store).
  it("stay out of promise resolution when held by a record", async () => {
    const calls: string[] = [];
    const echo = facade(calls);

    const record = await Promise.resolve({controller: echo});

    expect(record.controller).toBe(echo);
    expect(calls).toEqual([]);
  });
});

describe("the runtime client's transport", () => {
  it("sends payloads with undefined fields as strict JSON the protocol accepts", async () => {
    const sent: unknown[] = [];
    const transport = strictJsonTransport({
      invoke: async (call) => {
        // What pi-client does with the call: encode it into a frame, which throws on non-JSON.
        encodeClientMessage({type: "request", id: "1", target: {serverId: "3f8c2a64-5d1e-4b7a-9c2f-6e1d0a8b4c57"}, call: call as never});
        sent.push(call.args);
        return null;
      },
      subscribe: vi.fn(),
    });

    await transport.invoke({serviceId: "supernova.configuration", member: "get", args: [{projectPath: undefined} as never]}, BACKGROUND_CONTEXT);

    expect(sent).toEqual([[{}]]);
  });
});
