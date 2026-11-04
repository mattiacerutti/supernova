import type {Host, Link} from "@earendil-works/chord";
import {createHost, memoryLinkPair} from "@earendil-works/chord";
import type {Context} from "@earendil-works/chord/context";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {SessionHost} from "@supernova/contracts/lib/protocol";
import type {SessionRuntimeFacetDeps} from "@supernova/agent-runtime/features/session-runtime/facet";
import {SessionRuntime, sessionRuntimeFacet} from "@supernova/agent-runtime/features/session-runtime/facet";

type StartedHost = {
  readonly generation: number;
  readonly host: Host<RuntimePrincipal>;
  readonly link: Link;
  /** Held so the worker stays live whatever references come and go. */
  readonly runtime: {abort(context: Context): Promise<unknown>; release(): void};
};

export interface SessionHostsDeps extends Omit<SessionRuntimeFacetDeps, "sessionId"> {
  readonly exists: (sessionId: string) => Promise<boolean>;
  /** A stopped host sends no final report, so its session's running state is cleared here. */
  readonly stopped: (sessionId: string) => void;
}

/** One in-process host per session, started by the server's route. No idle eviction: accepted work outlives its holders. */
export class SessionHosts {
  private readonly started = new Map<string, Promise<StartedHost>>();
  private readonly generations = new Map<string, number>();
  /** The route resolves again once a released host's link closes; it must not restart the session. */
  private readonly releasing = new Set<string>();
  private generation = 0;

  public constructor(private readonly deps: SessionHostsDeps) {}

  public current(sessionId: string, generation: number): boolean {
    return this.generations.get(sessionId) === generation;
  }

  public running(sessionId: string): boolean {
    return this.started.has(sessionId);
  }

  /** Test-only: production code reaches session hosts through the route. */
  public async startedHost(sessionId: string): Promise<Host<RuntimePrincipal> | undefined> {
    return (await this.started.get(sessionId)?.catch(() => undefined))?.host;
  }

  public routeOn(server: Host<RuntimePrincipal>, context: Context): void {
    server.route(
      SessionHost,
      {
        authorize: (principal, address) => principal.kind === "owner" || principal.kind === "server" || (principal.kind === "worker" && principal.sessionId === address.params.id),
        resolve: async (address) => {
          const started = await this.start(address.params.id);
          return {link: started.link, principal: workerPrincipal(address.params.id, started.generation), trusted: true};
        },
      },
      context
    );
  }

  /** Without `abort`, interrupted work resumes on the session's next start. */
  public async release(sessionId: string, options?: {readonly abort?: boolean}): Promise<void> {
    const pending = this.started.get(sessionId);
    if (!pending) return;
    this.releasing.add(sessionId);
    try {
      this.started.delete(sessionId);
      this.generations.delete(sessionId);
      const started = await pending.catch(() => undefined);
      this.deps.stopped(sessionId);
      if (!started) return;
      if (options?.abort) await started.runtime.abort(BACKGROUND_CONTEXT).catch(() => undefined);
      await started.host.close(BACKGROUND_CONTEXT).catch((error: unknown) => console.error("[sessions]", error));
    } finally {
      this.releasing.delete(sessionId);
    }
  }

  public async dispose(): Promise<void> {
    await Promise.all([...this.started.keys()].map((sessionId) => this.release(sessionId)));
  }

  private start(sessionId: string): Promise<StartedHost> {
    let pending = this.started.get(sessionId);
    if (!pending) {
      const generation = ++this.generation;
      this.generations.set(sessionId, generation);
      pending = this.open(sessionId, generation);
      this.started.set(sessionId, pending);
      pending.catch(() => {
        if (this.started.get(sessionId) !== pending) return;
        this.started.delete(sessionId);
        this.generations.delete(sessionId);
        this.deps.stopped(sessionId);
      });
    }
    return pending;
  }

  private async open(sessionId: string, generation: number): Promise<StartedHost> {
    if (this.releasing.has(sessionId)) throw new Error("The session was released.");
    if (!(await this.deps.exists(sessionId))) throw new Error("Session not found.");
    const [up, down] = memoryLinkPair();
    const principal = workerPrincipal(sessionId, generation);
    const host = createHost<RuntimePrincipal>({
      address: SessionHost({id: sessionId}),
      principal,
      onError: (error) => console.error(`[session ${sessionId}]`, error),
    });
    host.connect(down, {principal: {kind: "server"}, trusted: true}, BACKGROUND_CONTEXT);
    try {
      await host.load([{name: "@supernova/session", facet: sessionRuntimeFacet({...this.deps, sessionId})}], BACKGROUND_CONTEXT);
      const runtime = host.hold(SessionRuntime, {}, BACKGROUND_CONTEXT);
      return {generation, host, link: up, runtime};
    } catch (error) {
      await host.close(BACKGROUND_CONTEXT).catch(() => undefined);
      throw error;
    }
  }
}

function workerPrincipal(sessionId: string, generation: number): RuntimePrincipal {
  return {kind: "worker", sessionId, generation};
}
