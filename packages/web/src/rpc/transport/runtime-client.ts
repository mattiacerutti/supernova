import type {ReplicatedState, Service} from "@earendil-works/chord";
import {createRemoteServiceBinding} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {ByteTransportFactory, ConnectionState} from "@earendil-works/pi-client";
import {Client, createClientServiceTransport} from "@earendil-works/pi-client";
import {ConfigurationService} from "@supernova/contracts/configuration/services";
import {ExtensionsService} from "@supernova/contracts/extensions/services";
import {FoldersService} from "@supernova/contracts/folders/services";
import {ProjectsService} from "@supernova/contracts/projects/services";
import {ProvidersService} from "@supernova/contracts/providers/services";
import type {ClientService} from "@supernova/contracts/runtime/services";
import {RUNTIME_SERVER_ID, RUNTIME_SOCKET_PATH} from "@supernova/contracts/runtime/services";
import type {Session} from "@supernova/contracts/sessions/schemas";
import type {SessionDirectoryState} from "@supernova/contracts/sessions/services";
import {ComposerService, SessionController, SessionDirectory, SessionManagement, SessionTranscript} from "@supernova/contracts/sessions/services";
import {TerminalsService} from "@supernova/contracts/terminals/services";
import {WorkspaceService} from "@supernova/contracts/workspace/services";
import {resolveSocketUrl} from "@/rpc/transport/endpoint";

const RECONNECT_DELAY_MS = 1_000;

const SERVER_SERVICES = [
  ComposerService,
  ConfigurationService,
  ExtensionsService,
  FoldersService,
  ProjectsService,
  ProvidersService,
  SessionDirectory,
  SessionManagement,
  TerminalsService,
  WorkspaceService,
] as const;

/** Connects one WebSocket carrying the runtime protocol's framed bytes as binary messages. */
function webSocketTransport(url: string): ByteTransportFactory {
  return (handlers) =>
    new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
      let open = false;
      socket.onopen = () => {
        open = true;
        resolve({
          send: async (chunk) => {
            if (socket.readyState !== WebSocket.OPEN) throw new Error("The runtime connection is closed.");
            // A copy owns its buffer outright; the chunk's may be shared or resizable.
            socket.send(chunk.slice());
          },
          close: () => socket.close(),
        });
      };
      socket.onmessage = (event) => handlers.onData(new Uint8Array(event.data as ArrayBuffer));
      socket.onerror = () => {
        if (!open) reject(new Error("Could not connect to the runtime."));
        else handlers.onError(new Error("The runtime connection failed."));
      };
      socket.onclose = () => {
        if (open) handlers.onClose();
        else reject(new Error("Could not connect to the runtime."));
      };
    });
}

/**
 * A service whose methods wait for the current connection and take no `Context`. A call made while (re)connecting
 * waits instead of failing as disconnected.
 */
function connectedService<T extends object>(service: T, connected: () => Promise<void>): ClientService<T> {
  return new Proxy(service, {
    get: (target, member) => {
      const value = Reflect.get(target, member) as unknown;
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        await connected();
        return (value as (...args: unknown[]) => Promise<unknown>)(...args, BACKGROUND_CONTEXT);
      };
    },
  }) as unknown as ClientService<T>;
}

/** The session the connection is attached to: its controller and transcript. */
export interface AttachedSession {
  readonly sessionId: string;
  readonly controller: ClientService<SessionController>;
  readonly transcript: ReplicatedState<Session>;
}

/**
 * The browser's connection to the runtime: every server-wide Chord service, and the services of the one attached
 * session. Reconnects after a drop, rebinds every service, and attaches the same session again.
 */
export interface RuntimeClient {
  readonly composer: ClientService<ComposerService>;
  readonly configuration: ClientService<ConfigurationService>;
  readonly extensions: ClientService<ExtensionsService>;
  readonly folders: ClientService<FoldersService>;
  readonly projects: ClientService<ProjectsService>;
  readonly providers: ClientService<ProvidersService>;
  readonly management: ClientService<SessionManagement>;
  readonly directory: ReplicatedState<SessionDirectoryState>;
  readonly terminals: ClientService<TerminalsService>;
  readonly workspace: ClientService<WorkspaceService>;
  /** Attaches the session's services, replacing the previous attachment; resolves once its transcript arrived. */
  attach(sessionId: string): Promise<AttachedSession>;
  /** Calls `listener` on every connection change; a reconnect means state was missed and must be read again. */
  onConnectionChange(listener: (state: ConnectionState) => void): () => void;
  dispose(): Promise<void>;
}

/** Opens the runtime connection of the server at `endpoint`. */
export function createRuntimeClient(endpoint: string): RuntimeClient {
  const client = new Client({serverId: RUNTIME_SERVER_ID, transportFactory: webSocketTransport(resolveSocketUrl(endpoint, RUNTIME_SOCKET_PATH))});
  const serverServices = createRemoteServiceBinding({
    services: SERVER_SERVICES,
    transport: createClientServiceTransport(client, () => ({serverId: RUNTIME_SERVER_ID})),
    bound: false,
  });
  const sessionServices = createRemoteServiceBinding({
    services: [SessionController, SessionTranscript],
    transport: createClientServiceTransport(client, () => client.attachment),
    bound: false,
  });

  let connected: Promise<void> = Promise.resolve();
  let markConnected: () => void = () => undefined;
  const awaitConnection = (): void => {
    connected = new Promise((resolve) => (markConnected = resolve));
  };
  awaitConnection();
  const service = <T extends object>(token: Service<T>) => connectedService(serverServices.use(token), () => connected);

  const management = service(SessionManagement);
  const listeners = new Set<(state: ConnectionState) => void>();
  let attachedId: string | undefined;
  let attaching: Promise<AttachedSession> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const attachNow = async (sessionId: string): Promise<AttachedSession> => {
    const outcome = await management.attach(sessionId);
    if (!outcome.ok) throw new Error(outcome.error.message);
    await sessionServices.rebind(true, BACKGROUND_CONTEXT);
    const transcript = sessionServices.use(SessionTranscript).state;
    const controller = connectedService(sessionServices.use(SessionController), () => connected);
    await sessionServices.ready(BACKGROUND_CONTEXT);
    attachedId = sessionId;
    return {sessionId, controller, transcript};
  };

  const connect = (): void => {
    if (disposed) return;
    void client.connect().then(
      async () => {
        await serverServices.rebind(true, BACKGROUND_CONTEXT);
        markConnected();
        if (attachedId) await attachNow(attachedId).catch(() => undefined);
      },
      () => {
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    );
  };

  client.onConnectionStateChange(({state}) => {
    for (const listener of listeners) listener(state);
    if (state !== "disconnected" || disposed) return;
    awaitConnection();
    void serverServices.rebind(false, BACKGROUND_CONTEXT).catch(() => undefined);
    void sessionServices.rebind(false, BACKGROUND_CONTEXT).catch(() => undefined);
    reconnectTimer ??= setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, RECONNECT_DELAY_MS);
  });
  connect();

  return {
    composer: service(ComposerService),
    configuration: service(ConfigurationService),
    extensions: service(ExtensionsService),
    folders: service(FoldersService),
    projects: service(ProjectsService),
    providers: service(ProvidersService),
    management,
    directory: serverServices.use(SessionDirectory).state,
    terminals: service(TerminalsService),
    workspace: service(WorkspaceService),
    attach(sessionId) {
      const previous = attaching ?? Promise.resolve(undefined);
      const next = previous.catch(() => undefined).then(() => attachNow(sessionId));
      attaching = next;
      return next;
    },
    onConnectionChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async dispose() {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      await Promise.allSettled([serverServices.dispose(BACKGROUND_CONTEXT), sessionServices.dispose(BACKGROUND_CONTEXT)]);
      await client.dispose();
    },
  };
}

let sharedClient: RuntimeClient | undefined;

/** The app's runtime connection to its local endpoint; connection selection can supply a different endpoint here. */
export async function getRuntimeClient(): Promise<RuntimeClient> {
  sharedClient ??= createRuntimeClient(window.desktopApi?.serverUrl ?? window.location.origin);
  return sharedClient;
}
