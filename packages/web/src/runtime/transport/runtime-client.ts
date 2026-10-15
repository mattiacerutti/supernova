import type {Host, WebSocketLike} from "@earendil-works/chord";
import {copyJson, createHost, webSocketLink} from "@earendil-works/chord";
import {ConfigurationService} from "@supernova/contracts/services/configuration/services";
import {ExtensionsService} from "@supernova/contracts/services/extensions/services";
import {FoldersService} from "@supernova/contracts/services/folders/services";
import {ProjectsService} from "@supernova/contracts/services/projects/services";
import {ProvidersService} from "@supernova/contracts/services/providers/services";
import {RUNTIME_HOST, RUNTIME_SOCKET_PATH} from "@supernova/contracts/lib/protocol";
import {SessionRuntimeService} from "@supernova/contracts/services/session-runtime/services";
import {SessionsService} from "@supernova/contracts/services/sessions/services";
import {TerminalService, WorkspaceService} from "@supernova/contracts/services/workspace/services";
import {resolveSocketUrl} from "@/runtime/transport/endpoint";

const RECONNECT_DELAY_MS = 1_000;

export type ConnectionState = "connected" | "disconnected";

export interface SessionRuntimeHold {
  readonly service: SessionRuntimeService;
  readonly ready: Promise<void>;
  readonly release: () => void;
}

/** `ready` rejects for an unknown or closed terminal; `onGone` reports one that went away while held. */
export interface TerminalHold {
  readonly service: TerminalService;
  readonly ready: Promise<void>;
  readonly onGone: (listener: () => void) => () => void;
  readonly release: () => void;
}

/** A call made while disconnected waits for the reconnect, after which state members deliver fresh values. */
export interface RuntimeClient {
  readonly configuration: ConfigurationService;
  readonly extensions: ExtensionsService;
  readonly folders: FoldersService;
  readonly projects: ProjectsService;
  readonly providers: ProvidersService;
  readonly sessions: SessionsService;
  readonly workspace: WorkspaceService;
  holdSession(sessionId: string): SessionRuntimeHold;
  holdTerminal(terminalId: string): TerminalHold;
  ready(): Promise<void>;
  onConnectionChange(listener: (state: ConnectionState) => void): () => void;
  dispose(): Promise<void>;
}

/** Chord's JSON frames drop `undefined` silently; dropping it here once makes that explicit. */
export function strictJsonMembers<T extends object>(handle: T, name: string): T {
  return new Proxy(handle, {
    get(target, member) {
      const value: unknown = Reflect.get(target, member);
      if (typeof value !== "function" || typeof member !== "string") return value;
      return async (payload: unknown) => {
        try {
          return await (value as (payload: unknown) => Promise<unknown>)(payload === undefined ? null : copyJson(payload as never, {omitUndefinedProperties: true}));
        } catch (error) {
          console.error(`[runtime] ${name}.${member} failed`, error);
          throw error;
        }
      };
    },
  });
}

export function createRuntimeClient(endpoint: string): RuntimeClient {
  const url = resolveSocketUrl(endpoint, RUNTIME_SOCKET_PATH);
  const host: Host = createHost({name: "browser", kind: "client", onError: (error) => console.error("[runtime]", error)});

  const listeners = new Set<(state: ConnectionState) => void>();
  let state: ConnectionState = "disconnected";
  let disposed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  const setState = (next: ConnectionState): void => {
    if (state === next) return;
    state = next;
    for (const listener of [...listeners]) listener(next);
  };

  const connect = (): void => {
    if (disposed) return;
    const socket = new WebSocket(url);
    socket.addEventListener("open", () => setState("connected"));
    socket.addEventListener("close", () => {
      setState("disconnected");
      if (!disposed) reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
    });
    host.connect(webSocketLink(socket as unknown as WebSocketLike));
  };
  connect();

  const at = {at: RUNTIME_HOST};
  const services = {
    configuration: host.get(ConfigurationService, {}, at),
    extensions: host.get(ExtensionsService, {}, at),
    folders: host.get(FoldersService, {}, at),
    projects: host.get(ProjectsService, {}, at),
    providers: host.get(ProvidersService, {}, at),
    sessions: host.get(SessionsService, {}, at),
    workspace: host.get(WorkspaceService, {}, at),
  };
  const ready = Promise.all(Object.values(services).map((handle) => handle.ready)).then(() => undefined);

  return {
    configuration: strictJsonMembers(services.configuration, "configuration"),
    extensions: strictJsonMembers(services.extensions, "extensions"),
    folders: strictJsonMembers(services.folders, "folders"),
    projects: strictJsonMembers(services.projects, "projects"),
    providers: strictJsonMembers(services.providers, "providers"),
    sessions: strictJsonMembers(services.sessions, "sessions"),
    workspace: strictJsonMembers(services.workspace, "workspace"),
    holdSession(sessionId) {
      const handle = host.get(SessionRuntimeService, {sessionId}, at);
      return {service: strictJsonMembers(handle, "sessionRuntime"), ready: handle.ready, release: () => handle.release()};
    },
    holdTerminal(terminalId) {
      const handle = host.get(TerminalService, {terminalId}, at);
      return {
        service: strictJsonMembers(handle, "terminal"),
        ready: handle.ready,
        onGone: (listener) => handle.onStatus((status) => status === "gone" && listener()),
        release: () => handle.release(),
      };
    },
    ready: () => ready,
    onConnectionChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async dispose() {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      await host.close();
    },
  };
}

let sharedClient: RuntimeClient | undefined;

export async function getRuntimeClient(): Promise<RuntimeClient> {
  sharedClient ??= createRuntimeClient(window.desktopApi?.serverUrl ?? window.location.origin);
  await sharedClient.ready();
  return sharedClient;
}
