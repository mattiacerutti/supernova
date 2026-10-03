import type {ReplicatedState} from "@earendil-works/chord";
import {createRemoteServiceBinding} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {ByteTransportFactory, ConnectionState} from "@earendil-works/pi-client";
import {Client, createClientServiceTransport} from "@earendil-works/pi-client";
import type {Session} from "@supernova/contracts/sessions/schemas";
import type {SessionDirectoryState, SessionManagement as SessionManagementService, SessionController as SessionControllerService} from "@supernova/contracts/sessions/services";
import {SESSION_SERVER_ID, SESSION_SERVICES_PATH, SessionController, SessionDirectory, SessionManagement, SessionTranscript} from "@supernova/contracts/sessions/services";
import {resolveSocketUrl} from "@/rpc/transport/endpoint";

const RECONNECT_DELAY_MS = 1_000;

/** Connects one WebSocket carrying the session service protocol's framed bytes as binary messages. */
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
            if (socket.readyState !== WebSocket.OPEN) throw new Error("The session socket is closed.");
            // A copy owns its buffer outright; the chunk's may be shared or resizable.
            socket.send(chunk.slice());
          },
          close: () => socket.close(),
        });
      };
      socket.onmessage = (event) => handlers.onData(new Uint8Array(event.data as ArrayBuffer));
      socket.onerror = () => {
        if (!open) reject(new Error("Could not connect to the session server."));
        else handlers.onError(new Error("The session connection failed."));
      };
      socket.onclose = () => {
        if (open) handlers.onClose();
        else reject(new Error("Could not connect to the session server."));
      };
    });
}

/** The session the connection is attached to: its controller and transcript. */
export interface AttachedSession {
  readonly sessionId: string;
  readonly controller: SessionControllerService;
  readonly transcript: ReplicatedState<Session>;
}

/**
 * The browser's connection to the server's Chord session services: server-wide management and the session directory,
 * and the services of the one attached session. Reconnects after a drop and attaches the same session again.
 */
export interface SessionServicesClient {
  readonly management: SessionManagementService;
  readonly directory: ReplicatedState<SessionDirectoryState>;
  /** Attaches the session's services, replacing the previous attachment; resolves once its transcript arrived. */
  attach(sessionId: string): Promise<AttachedSession>;
  /** Calls `listener` on every connection change; a reconnect means state was missed and must be read again. */
  onConnectionChange(listener: (state: ConnectionState) => void): () => void;
  dispose(): Promise<void>;
}

/** Opens the session service connection of the server at `endpoint`. */
export function createSessionServicesClient(endpoint: string): SessionServicesClient {
  const url = resolveSocketUrl(endpoint, SESSION_SERVICES_PATH);
  const client = new Client({serverId: SESSION_SERVER_ID, transportFactory: webSocketTransport(url)});
  const serverServices = createRemoteServiceBinding({
    services: [SessionDirectory, SessionManagement],
    transport: createClientServiceTransport(client, () => ({serverId: SESSION_SERVER_ID})),
    bound: false,
  });
  const sessionServices = createRemoteServiceBinding({
    services: [SessionController, SessionTranscript],
    transport: createClientServiceTransport(client, () => client.attachment),
    bound: false,
  });
  const remoteManagement = serverServices.use(SessionManagement);
  const directory = serverServices.use(SessionDirectory).state;
  // Calls wait for the current connection: one made while (re)connecting would otherwise fail as disconnected.
  let connected: Promise<void> = Promise.resolve();
  let markConnected: () => void = () => undefined;
  const awaitConnection = (): void => {
    connected = new Promise((resolve) => (markConnected = resolve));
  };
  awaitConnection();
  const management: SessionManagementService = new Proxy(remoteManagement, {
    get: (target, member) => {
      const method = Reflect.get(target, member) as (...args: unknown[]) => Promise<unknown>;
      return async (...args: unknown[]) => {
        await connected;
        return method(...args);
      };
    },
  });
  const listeners = new Set<(state: ConnectionState) => void>();
  let attachedId: string | undefined;
  let attaching: Promise<AttachedSession> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const attachNow = async (sessionId: string): Promise<AttachedSession> => {
    await connected;
    const outcome = await remoteManagement.attach(sessionId, BACKGROUND_CONTEXT);
    if (!outcome.ok) throw new Error(outcome.error.message);
    await sessionServices.rebind(true, BACKGROUND_CONTEXT);
    const transcript = sessionServices.use(SessionTranscript).state;
    const controller = sessionServices.use(SessionController);
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
      () => undefined
    );
  };

  client.onConnectionStateChange(({state}) => {
    for (const listener of listeners) listener(state);
    if (state !== "disconnected" || disposed) return;
    awaitConnection();
    void serverServices.rebind(false, BACKGROUND_CONTEXT).catch(() => undefined);
    void sessionServices.rebind(false, BACKGROUND_CONTEXT).catch(() => undefined);
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
  });
  connect();

  return {
    management,
    directory,
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

let sharedClient: SessionServicesClient | undefined;

/** The app's session service connection to its local endpoint, like `getRpcClient`. */
export async function getSessionServicesClient(): Promise<SessionServicesClient> {
  sharedClient ??= createSessionServicesClient(window.desktopApi?.serverUrl ?? window.location.origin);
  return sharedClient;
}
