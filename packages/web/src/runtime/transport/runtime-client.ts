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

/** A held session: its runtime service, until `release`. `ready` rejects for an unknown session. */
export interface SessionRuntimeHold {
  readonly service: SessionRuntimeService;
  readonly ready: Promise<void>;
  readonly release: () => void;
}

/**
 * A held terminal: its service, until `release`. `ready` rejects for an unknown or closed terminal; `onGone` reports
 * a terminal that went away while held, such as after a server restart.
 */
export interface TerminalHold {
  readonly service: TerminalService;
  readonly ready: Promise<void>;
  readonly onGone: (listener: () => void) => () => void;
  readonly release: () => void;
}

/**
 * The browser's connection to the runtime: one Chord handle per runtime service. A call made while the connection is
 * down waits for it to come back. The client reconnects after a drop and Chord holds every service again; state
 * members then deliver a fresh value.
 */
export interface RuntimeClient {
  readonly configuration: ConfigurationService;
  readonly extensions: ExtensionsService;
  readonly folders: FoldersService;
  readonly projects: ProjectsService;
  readonly providers: ProvidersService;
  readonly sessions: SessionsService;
  readonly workspace: WorkspaceService;
  /** Holds a session's runtime service; see `SessionRuntimeHold`. */
  holdSession(sessionId: string): SessionRuntimeHold;
  /** Holds a terminal's service; see `TerminalHold`. */
  holdTerminal(terminalId: string): TerminalHold;
  /** Resolves once the server's services are live. */
  ready(): Promise<void>;
  /** Calls `listener` on every connection change; a reconnect means state was missed and must be read again. */
  onConnectionChange(listener: (state: ConnectionState) => void): () => void;
  dispose(): Promise<void>;
}

/**
 * A handle whose methods send payloads as strict JSON. Chord's frames are JSON, which drops `undefined` fields
 * silently, but the contracts' optional fields are commonly set to `undefined` (`{projectPath: undefined}`), so they are
 * dropped here, once, explicitly. Failures are logged with the service and member that failed.
 */
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

/** Opens the runtime connection of the server at `endpoint`. */
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

  // A dropped socket is replaced; Chord re-holds every handle over the new link.
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

/**
 * The app's runtime connection to its local endpoint, once it is up; connection selection can supply a different
 * endpoint here. Rendering waits for it, so the first calls never race the connection.
 */
export async function getRuntimeClient(): Promise<RuntimeClient> {
  sharedClient ??= createRuntimeClient(window.desktopApi?.serverUrl ?? window.location.origin);
  await sharedClient.ready();
  return sharedClient;
}
