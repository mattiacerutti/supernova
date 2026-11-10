import type {Host, Link, PluginFacet, RouteHandle} from "@earendil-works/chord";
import {createHost, memoryLinkPair} from "@earendil-works/chord";
import type {Context} from "@earendil-works/chord/context";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {SessionHost as SessionHostKind} from "@supernova/contracts/lib/protocol";
import type {ChatServer} from "@supernova/contracts/services/chat/services";
import {ChatService} from "@supernova/contracts/services/chat/services";
import {expectVariant} from "@supernova/agent-runtime/lib/chord/principals";
import type {SessionRecord} from "@supernova/agent-runtime/core/session-state";

interface SessionHost {
  readonly generation: number;
  readonly host: Host<RuntimePrincipal>;
  readonly link: Link;
}

export interface SessionHostsDeps {
  readonly server: Host<RuntimePrincipal>;
  readonly find: (sessionId: string, context: Context) => Promise<SessionRecord | undefined>;
  readonly facets: (record: SessionRecord) => readonly PluginFacet<RuntimePrincipal>[];
  readonly onHostClosed: (sessionId: string) => void;
}

const RELOAD_READY_MS = 5_000;
const ABORT_READY_MS = 1_000;

export class SessionHosts {
  private readonly deps: SessionHostsDeps;
  private readonly hosts = new Map<string, SessionHost>();
  private readonly route: RouteHandle<typeof SessionHostKind>;
  private generation = 0;

  // Before the server host loads: Chord takes routes only then.
  public constructor(deps: SessionHostsDeps, context: Context) {
    this.deps = deps;
    this.route = deps.server.route(
      SessionHostKind,
      {
        authorize: (principal, address) => principal.kind === "owner" || principal.kind === "server" || (principal.kind === "worker" && principal.sessionId === address.params.id),
        resolve: async (address, resolving) => {
          const {generation, link} = await this.hostOf(address.params.id, resolving);
          return {link, principal: workerPrincipal(address.params.id, generation), trusted: true};
        },
      },
      context
    );
  }

  public async release(sessionId: string, options?: {readonly abort?: boolean}): Promise<void> {
    const running = this.hosts.get(sessionId);

    // Before the suspension, which would hold the abort back with every other call.
    if (running && options?.abort) await this.withChat(sessionId, (chat) => chat.abort(BACKGROUND_CONTEXT), ABORT_READY_MS).catch(() => undefined);
    this.route.suspend(SessionHostKind({id: sessionId}));
    if (!running) return;

    this.hosts.delete(sessionId);
    this.deps.onHostClosed(sessionId);
    await running.host.close(BACKGROUND_CONTEXT).catch((error: unknown) => console.error("[sessions]", error));
  }

  public current(sessionId: string, generation: number): boolean {
    return this.hosts.get(sessionId)?.generation === generation;
  }

  public async reload(): Promise<void> {
    await Promise.all([...this.hosts.keys()].map((sessionId) => this.withChat(sessionId, (chat) => chat.reload(BACKGROUND_CONTEXT), RELOAD_READY_MS).catch(() => undefined)));
  }

  public async close(): Promise<void> {
    await Promise.all([...this.hosts.keys()].map((sessionId) => this.release(sessionId)));
  }

  private async withChat<T>(sessionId: string, call: (chat: ChatServer) => Promise<T>, readyTimeout: number): Promise<T> {
    const chat = await this.deps.server.get(ChatService, {sessionId}, BACKGROUND_CONTEXT, {readyTimeout});
    try {
      return await call(expectVariant(chat, "server"));
    } finally {
      chat.release();
    }
  }

  private async hostOf(sessionId: string, context: Context): Promise<SessionHost> {
    const existing = this.hosts.get(sessionId);
    if (existing) return existing;

    const record = await this.deps.find(sessionId, context);
    if (!record || record.archivedAt !== undefined) throw new Error("Session not found.");

    // A resolve that raced another for the same session keeps the first host.
    const raced = this.hosts.get(sessionId);
    if (raced) return raced;

    const generation = ++this.generation;
    const [up, down] = memoryLinkPair();
    const host = createHost<RuntimePrincipal>({
      address: SessionHostKind({id: sessionId}),
      principal: workerPrincipal(sessionId, generation),
      onError: (error) => console.error(`[session ${sessionId}]`, error),
    });
    host.connect(down, {principal: {kind: "server"}, trusted: true}, BACKGROUND_CONTEXT);

    const running: SessionHost = {generation, host, link: up};
    this.hosts.set(sessionId, running);

    // A session that fails to open fails its chat; only an undeclarable facet rejects here.
    void host.load(this.deps.facets(record), BACKGROUND_CONTEXT).catch((error: unknown) => {
      console.error(`[session ${sessionId}]`, error);
      if (this.hosts.get(sessionId) === running) void this.release(sessionId);
    });
    return running;
  }
}

function workerPrincipal(sessionId: string, generation: number): RuntimePrincipal {
  return {kind: "worker", sessionId, generation};
}
