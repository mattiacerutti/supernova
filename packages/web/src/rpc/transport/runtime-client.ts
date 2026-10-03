import type {RemoteServiceTransport} from "@earendil-works/chord";
import {copyJson, createRemoteServiceBinding} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {ByteTransportFactory, ConnectionState} from "@earendil-works/pi-client";
import {Client, createClientServiceTransport} from "@earendil-works/pi-client";
import {ConfigurationService} from "@supernova/contracts/services/configuration/services";
import {ExtensionsService} from "@supernova/contracts/services/extensions/services";
import {FoldersService} from "@supernova/contracts/services/folders/services";
import {ProjectsService} from "@supernova/contracts/services/projects/services";
import {ProvidersService} from "@supernova/contracts/services/providers/services";
import {RUNTIME_SERVER_ID, RUNTIME_SOCKET_PATH} from "@supernova/contracts/lib/protocol";
import {SessionRuntimeService} from "@supernova/contracts/services/session-runtime/services";
import {SessionsService} from "@supernova/contracts/services/sessions/services";
import {WorkspaceService} from "@supernova/contracts/services/workspace/services";
import {resolveSocketUrl} from "@/rpc/transport/endpoint";

const RECONNECT_DELAY_MS = 1_000;

const SERVER_SERVICES = [ConfigurationService, ExtensionsService, FoldersService, ProjectsService, ProvidersService, SessionsService, WorkspaceService] as const;

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
 * Sends calls as strict JSON. The protocol rejects `undefined` anywhere in a frame, and the contracts' optional fields
 * are commonly set to `undefined` (`{projectPath: undefined}` for global configuration), so it is dropped here,
 * once, rather than at every call site. Failures are logged with the service and member that failed.
 */
export function strictJsonTransport(transport: RemoteServiceTransport): RemoteServiceTransport {
  return {
    invoke: async (call, context) => {
      try {
        return await transport.invoke({...call, args: call.args.map((arg) => copyJson(arg, {omitUndefinedProperties: true}))}, context);
      } catch (error) {
        console.error(`[runtime] ${call.serviceId}.${call.member} failed`, error);
        throw error;
      }
    },
    subscribe: (serviceId, mode, listener, context) => transport.subscribe(serviceId, mode, listener, context),
  };
}

/** The session the connection is attached to, and its session runtime service. */
export interface AttachedSession {
  readonly sessionId: string;
  readonly sessionRuntime: SessionRuntimeService;
}

/**
 * The browser's connection to the runtime: Chord's facades of the server's services, one per runtime feature, and
 * the session runtime service of the one attached session. Methods take Chord's `Context` last, as the contracts declare them. A call made while the
 * connection is down fails as disconnected; wait for `ready()` first where that matters (startup, reconnects). The
 * client reconnects after a drop, rebinds every service, and attaches the same session again.
 */
export interface RuntimeClient {
  readonly configuration: ConfigurationService;
  readonly extensions: ExtensionsService;
  readonly folders: FoldersService;
  readonly projects: ProjectsService;
  readonly providers: ProvidersService;
  /** Its `attach` also binds the attached session's runtime service, like the client's `attach`. */
  readonly sessions: SessionsService;
  readonly workspace: WorkspaceService;
  /** Resolves once connected with every server-wide service bound; after a drop, once reconnected. */
  ready(): Promise<void>;
  /** Attaches the session, replacing the previous attachment; resolves once its document arrived. */
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
    transport: strictJsonTransport(createClientServiceTransport(client, () => ({serverId: RUNTIME_SERVER_ID}))),
    bound: false,
  });
  const sessionServices = createRemoteServiceBinding({
    services: [SessionRuntimeService],
    transport: strictJsonTransport(createClientServiceTransport(client, () => client.attachment)),
    bound: false,
  });

  // Settles each time the connection is up with its services bound; replaced when the connection drops.
  let connected!: Promise<void>;
  let markConnected: () => void = () => undefined;
  const awaitConnection = (): void => {
    connected = new Promise((resolve) => (markConnected = resolve));
  };
  awaitConnection();

  const listeners = new Set<(state: ConnectionState) => void>();
  let attachedId: string | undefined;
  let attaching: Promise<AttachedSession> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const remoteSessions = serverServices.use(SessionsService);
  const sessionRuntime = sessionServices.use(SessionRuntimeService);

  /** Asks the server to route this connection's session runtime service to the session, then binds it. */
  const attachNow = async (sessionId: string): Promise<AttachedSession> => {
    await connected;
    const outcome = await remoteSessions.attach(sessionId, BACKGROUND_CONTEXT);
    if (!outcome.ok) throw new Error(outcome.error.message);
    await sessionServices.rebind(true, BACKGROUND_CONTEXT);
    await sessionServices.ready(BACKGROUND_CONTEXT);
    attachedId = sessionId;
    return {sessionId, sessionRuntime};
  };

  const attach = (sessionId: string): Promise<AttachedSession> => {
    const previous = attaching ?? Promise.resolve(undefined);
    const next = previous.catch(() => undefined).then(() => attachNow(sessionId));
    attaching = next;
    return next;
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
    configuration: serverServices.use(ConfigurationService),
    extensions: serverServices.use(ExtensionsService),
    folders: serverServices.use(FoldersService),
    projects: serverServices.use(ProjectsService),
    providers: serverServices.use(ProvidersService),
    // `attach` also binds this client's session runtime service; the other members are Chord's.
    sessions: {
      directory: remoteSessions.directory,
      create: (payload, context) => remoteSessions.create(payload, context),
      fork: (payload, context) => remoteSessions.fork(payload, context),
      rename: (payload, context) => remoteSessions.rename(payload, context),
      get: (payload, context) => remoteSessions.get(payload, context),
      listModels: (payload, context) => remoteSessions.listModels(payload, context),
      listComposerSuggestions: (payload, context) => remoteSessions.listComposerSuggestions(payload, context),
      attach: (sessionId) => attach(sessionId).then(() => ({ok: true, value: null}) as const),
      detach: (context) => remoteSessions.detach(context),
    },
    workspace: serverServices.use(WorkspaceService),
    ready: () => connected,
    attach,
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

/**
 * The app's runtime connection to its local endpoint, once it is up; connection selection can supply a different
 * endpoint here. Rendering waits for it, so the first calls never race the connection.
 */
export async function getRuntimeClient(): Promise<RuntimeClient> {
  sharedClient ??= createRuntimeClient(window.desktopApi?.serverUrl ?? window.location.origin);
  await sharedClient.ready();
  return sharedClient;
}
