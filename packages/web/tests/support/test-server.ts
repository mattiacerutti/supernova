import type {Facet, Host, Self, Watchable} from "@earendil-works/chord";
import type {Draft} from "@earendil-works/chord/delta";
import {createHost, memoryLinkPair} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {ServerHost, SessionHost} from "@supernova/contracts/lib/protocol";
import type {RuntimeClient} from "@/runtime/client";
import {runtimeClient} from "@/runtime/client";

export class Published<T> {
  private value: T;
  private readonly followers = new Set<(value: T) => void>();

  public constructor(initial: T) {
    this.value = initial;
  }

  public get current(): T {
    return this.value;
  }

  public set(value: T): void {
    this.value = value;
    for (const follower of [...this.followers]) follower(value);
  }

  public change(mutate: (draft: Draft<T>) => void): void {
    const draft = structuredClone(this.value) as Draft<T>;
    mutate(draft);
    this.set(draft as T);
  }

  public member(self: Pick<Self, "writable" | "derive" | "open">): Watchable<T> {
    const writable = self.writable(this.value);
    self.open(
      async () => {
        writable.set(this.value);
        const follower = (value: T) => writable.set(value);
        this.followers.add(follower);
        return () => void this.followers.delete(follower);
      },
      (stop) => stop()
    );
    return (self.derive as (sources: readonly unknown[], compute: (values: readonly [T]) => T) => Watchable<T>)([writable], ([value]) => value);
  }
}

export function testRuntimeClient(input: {readonly server: Facet<RuntimePrincipal>; readonly session: (sessionId: string) => Facet<RuntimePrincipal>}): {
  readonly client: RuntimeClient;
  readonly close: () => Promise<void>;
} {
  const onError = (error: unknown) => console.error("[test server]", error);
  const server = createHost<RuntimePrincipal>({address: ServerHost(), principal: {kind: "server"}, onError});
  const sessions = new Map<string, Host<RuntimePrincipal>>();
  server.route(
    SessionHost,
    {
      authorize: () => true,
      resolve: async (address) => {
        const sessionId = address.params.id;
        const principal: RuntimePrincipal = {kind: "worker", sessionId, generation: 1};
        const [up, down] = memoryLinkPair();
        const host = createHost<RuntimePrincipal>({address: SessionHost({id: sessionId}), principal, onError});
        host.connect(down, {principal: {kind: "server"}, trusted: true}, context);
        void host.load([{name: "@test/session", facet: input.session(sessionId)}], context);
        sessions.set(sessionId, host);
        return {link: up, principal, trusted: true};
      },
    },
    context
  );
  void server.load([{name: "@test/server", facet: input.server}], context);

  const browser = createHost<RuntimePrincipal>({onError});
  const client = runtimeClient(browser, (onState) => {
    const [down, up] = memoryLinkPair();
    server.accept(down, {principal: {kind: "owner"}}, context);
    browser.connect(up, {principal: {kind: "server"}}, context);
    onState("connected");
    return () => up.close();
  });
  return {
    client,
    close: async () => {
      await client.dispose();
      await Promise.all([...sessions.values()].map((host) => host.close(context)));
      await server.close(context);
    },
  };
}
