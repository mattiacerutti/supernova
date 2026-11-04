import type {Contract, Held, Host, Link, ParamsOf, RefState, WebSocketLike} from "@earendil-works/chord";
import {createHost, webSocketLink} from "@earendil-works/chord";
import type {Context} from "@earendil-works/chord/context";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {NativeWatchable} from "@earendil-works/chord/watch";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {RUNTIME_SOCKET_PATH} from "@supernova/contracts/lib/protocol";
import {ConfigurationService} from "@supernova/contracts/services/configuration/services";
import {ExtensionsService} from "@supernova/contracts/services/extensions/services";
import {FoldersService} from "@supernova/contracts/services/folders/services";
import {ProvidersService} from "@supernova/contracts/services/providers/services";
import type {ChatOwner as ChatOwnerReference} from "@supernova/contracts/services/session-runtime/services";
import {ChatService} from "@supernova/contracts/services/session-runtime/services";
import {SessionsService, SessionStatusService} from "@supernova/contracts/services/sessions/services";
import type {SessionsOwner as SessionsOwnerReference} from "@supernova/contracts/services/sessions/services";
import {TerminalService, WorkspaceService} from "@supernova/contracts/services/workspace/services";
import {resolveSocketUrl} from "@/runtime/transport/endpoint";
import {follow} from "@/runtime/transport/follow";

const RECONNECT_DELAY_MS = 1_000;
const context = BACKGROUND_CONTEXT;

export type ConnectionState = "connected" | "disconnected";

export interface ServiceHold<S> {
  readonly service: S;
  /** Rejects when the object fails for good: an unknown session or terminal. */
  readonly ready: Promise<void>;
  readonly onGone: (listener: () => void) => () => void;
  readonly release: () => void;
}

/** Methods without the trailing context: the client supplies one per call. */
export type ClientView<R> = {
  readonly [M in keyof R as M extends "variant" | "state" | "retry" | "release" ? never : M]: R[M] extends (context: Context) => infer Result
    ? () => Result
    : R[M] extends (payload: infer Payload, context: Context) => infer Result
      ? (payload: Payload) => Result
      : R[M];
};

type OwnerOf<C extends Contract> = ClientView<Extract<Held<C>, {readonly variant: "owner" | undefined}>>;
type ServerWide = typeof ConfigurationService | typeof ExtensionsService | typeof FoldersService | typeof ProvidersService | typeof WorkspaceService | typeof SessionStatusService;

export type ConfigurationOwner = OwnerOf<typeof ConfigurationService>;
export type ExtensionsOwner = OwnerOf<typeof ExtensionsService>;
export type FoldersOwner = OwnerOf<typeof FoldersService>;
export type ProvidersOwner = OwnerOf<typeof ProvidersService>;
export type WorkspaceOwner = OwnerOf<typeof WorkspaceService>;
export type SessionStatusOwner = OwnerOf<typeof SessionStatusService>;
export type TerminalOwner = OwnerOf<typeof TerminalService>;
export type ChatOwner = ClientView<ChatOwnerReference>;
export type SessionsOwner = ClientView<SessionsOwnerReference>;

/** A call made while disconnected waits for the reconnect, after which state members deliver fresh values. */
export interface RuntimeClient {
  readonly configuration: ConfigurationOwner;
  readonly extensions: ExtensionsOwner;
  readonly folders: FoldersOwner;
  readonly providers: ProvidersOwner;
  readonly workspace: WorkspaceOwner;
  readonly status: SessionStatusOwner;
  /** Its client id is made once per page load, so the view is this tab's. */
  readonly sessions: SessionsOwner;
  holdChat(sessionId: string): ServiceHold<ChatOwner>;
  holdTerminal(terminalId: string): ServiceHold<TerminalOwner>;
  ready(): Promise<void>;
  onConnectionChange(listener: (state: ConnectionState) => void): () => void;
  dispose(): Promise<void>;
}

/** Strict JSON on the wire: `undefined` fields are dropped here, once, rather than silently by the link. */
function strictJson(value: unknown): unknown {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

export function strictJsonMembers<T extends object>(held: T, name: string): T {
  return new Proxy(held, {
    get(target, member) {
      const value: unknown = Reflect.get(target, member);
      if (typeof value !== "function" || typeof member !== "string" || member === "release" || member === "retry") return value;
      return async (...args: unknown[]) => {
        const call = args.length === 0 ? [context] : [strictJson(args[0]), context];
        try {
          return await (value as (...callArgs: unknown[]) => Promise<unknown>).apply(target, call);
        } catch (error) {
          console.error(`[runtime] ${name}.${member} failed`, error);
          throw error;
        }
      };
    },
  });
}

function whenLive(state: NativeWatchable<RefState>): Promise<void> {
  return new Promise((resolve, reject) => {
    const settle = (value: RefState, stop: () => void) => {
      if (value.kind === "live") {
        stop();
        resolve();
      } else if (value.kind === "ended") {
        stop();
        reject(value.error);
      } else if (value.kind === "failed" && value.cause.kind !== "transient") {
        stop();
        reject(value.cause.error);
      }
    };
    const stop = follow(state, (value) => settle(value, () => queueMicrotask(stop)));
  });
}

function holdOf<C extends Contract, S>(host: Host<RuntimePrincipal>, Type: C, params: ParamsOf<C>, name: string): ServiceHold<S> {
  const held = host.hold(Type, params, context);
  const ready = whenLive(held.state);
  ready.catch(() => undefined);
  return {
    service: strictJsonMembers(held, name) as unknown as S,
    ready,
    onGone: (listener) => follow(held.state, (state) => state.kind === "ended" && listener()),
    release: () => held.release(),
  };
}

export function createRuntimeClient(endpoint: string): RuntimeClient {
  const url = resolveSocketUrl(endpoint, RUNTIME_SOCKET_PATH);
  const host = createHost<RuntimePrincipal>({onError: (error) => console.error("[runtime]", error)});

  const listeners = new Set<(state: ConnectionState) => void>();
  let state: ConnectionState = "disconnected";
  let disposed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  const setState = (next: ConnectionState): void => {
    if (state === next) return;
    state = next;
    for (const listener of [...listeners]) listener(next);
  };

  // Chord holds every reference again over each new link; the server stamps who the client is.
  const connect = (): void => {
    if (disposed) return;
    const socket = new WebSocket(url);
    socket.addEventListener("open", () => setState("connected"));
    socket.addEventListener("close", () => {
      setState("disconnected");
      if (!disposed) reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
    });
    const link: Link = webSocketLink(socket as unknown as WebSocketLike);
    host.connect(link, {principal: {kind: "server"}}, context);
  };
  connect();

  const loaded = host.load([], context);
  const serverWide = <C extends ServerWide>(Type: C, name: string) => holdOf<C, OwnerOf<C>>(host, Type, {} as ParamsOf<C>, name);
  const holds = {
    configuration: serverWide(ConfigurationService, "configuration"),
    extensions: serverWide(ExtensionsService, "extensions"),
    folders: serverWide(FoldersService, "folders"),
    providers: serverWide(ProvidersService, "providers"),
    workspace: serverWide(WorkspaceService, "workspace"),
    status: serverWide(SessionStatusService, "status"),
    sessions: holdOf<typeof SessionsService, SessionsOwner>(host, SessionsService, {clientId: crypto.randomUUID()}, "sessions"),
  };
  const ready = loaded.then(() => Promise.all(Object.values(holds).map((hold) => hold.ready))).then(() => undefined);

  return {
    configuration: holds.configuration.service,
    extensions: holds.extensions.service,
    folders: holds.folders.service,
    providers: holds.providers.service,
    workspace: holds.workspace.service,
    status: holds.status.service,
    sessions: holds.sessions.service,
    holdChat: (sessionId) => holdOf<typeof ChatService, ChatOwner>(host, ChatService, {sessionId}, "chat"),
    holdTerminal: (terminalId) => holdOf<typeof TerminalService, TerminalOwner>(host, TerminalService, {terminalId}, "terminal"),
    ready: () => ready,
    onConnectionChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async dispose() {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      await host.close(context);
    },
  };
}

let sharedClient: RuntimeClient | undefined;

export async function getRuntimeClient(): Promise<RuntimeClient> {
  sharedClient ??= createRuntimeClient(window.desktopApi?.serverUrl ?? window.location.origin);
  await sharedClient.ready();
  return sharedClient;
}
