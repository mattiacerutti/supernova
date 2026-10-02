import type {RemoteServiceTransport, ReplicatedState} from "@earendil-works/chord";
import {copyJson, createRemoteServiceBinding} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {ByteTransportFactory, ConnectionState} from "@earendil-works/pi-client";
import {Client, createClientServiceTransport} from "@earendil-works/pi-client";
import {ConfigurationService} from "@supernova/contracts/configuration/services";
import {ExtensionsService} from "@supernova/contracts/extensions/services";
import {FoldersService} from "@supernova/contracts/folders/services";
import {ProjectsService} from "@supernova/contracts/projects/services";
import {ProvidersService} from "@supernova/contracts/providers/services";
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

/** The session the connection is attached to: its controller and transcript. */
export interface AttachedSession {
  readonly sessionId: string;
  readonly controller: SessionController;
  readonly transcript: ReplicatedState<Session>;
}

/**
 * The browser's connection to the runtime: Chord's facades of every server-wide service, and the services of the one
 * attached session. Methods take Chord's `Context` last, as the contracts declare them. A call made while the
 * connection is down fails as disconnected; wait for `ready()` first where that matters (startup, reconnects). The
 * client reconnects after a drop, rebinds every service, and attaches the same session again.
 */
export interface RuntimeClient {
  readonly composer: ComposerService;
  readonly configuration: ConfigurationService;
  readonly extensions: ExtensionsService;
  readonly folders: FoldersService;
  readonly projects: ProjectsService;
  readonly providers: ProvidersService;
  readonly management: SessionManagement;
  readonly directory: ReplicatedState<SessionDirectoryState>;
  readonly terminals: TerminalsService;
  readonly workspace: WorkspaceService;
  /** Resolves once connected with every server-wide service bound; after a drop, once reconnected. */
  ready(): Promise<void>;
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
    transport: strictJsonTransport(createClientServiceTransport(client, () => ({serverId: RUNTIME_SERVER_ID}))),
    bound: false,
  });
  const sessionServices = createRemoteServiceBinding({
    services: [SessionController, SessionTranscript],
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

  const remoteManagement = serverServices.use(SessionManagement);
  const controller = sessionServices.use(SessionController);
  const transcript = sessionServices.use(SessionTranscript).state;

  /** Asks the server to route this connection's session services to the session, then binds them to it. */
  const attachNow = async (sessionId: string): Promise<AttachedSession> => {
    await connected;
    const outcome = await remoteManagement.attach(sessionId, BACKGROUND_CONTEXT);
    if (!outcome.ok) throw new Error(outcome.error.message);
    await sessionServices.rebind(true, BACKGROUND_CONTEXT);
    await sessionServices.ready(BACKGROUND_CONTEXT);
    attachedId = sessionId;
    return {sessionId, controller, transcript};
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
    composer: serverServices.use(ComposerService),
    configuration: serverServices.use(ConfigurationService),
    extensions: serverServices.use(ExtensionsService),
    folders: serverServices.use(FoldersService),
    projects: serverServices.use(ProjectsService),
    providers: serverServices.use(ProvidersService),
    // `attach` also binds this client's session services; the other members are Chord's.
    management: {
      create: (payload, context) => remoteManagement.create(payload, context),
      fork: (payload, context) => remoteManagement.fork(payload, context),
      rename: (payload, context) => remoteManagement.rename(payload, context),
      read: (payload, context) => remoteManagement.read(payload, context),
      attach: (sessionId) => attach(sessionId).then(() => ({ok: true, value: null}) as const),
      detach: (context) => remoteManagement.detach(context),
    },
    directory: serverServices.use(SessionDirectory).state,
    terminals: serverServices.use(TerminalsService),
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
