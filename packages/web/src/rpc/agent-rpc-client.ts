import {AgentRpcGroup} from "@pi-desktop/contracts";
import {Effect, Exit, Fiber, Layer, ManagedRuntime, Scope} from "effect";
import {RpcClient, RpcSerialization} from "effect/unstable/rpc";
import * as Socket from "effect/unstable/socket/Socket";

const SERVER_URL_SEARCH_PARAM = "agentDesktopServerUrl";

const makeAgentRpcProtocolClient = RpcClient.make(AgentRpcGroup);
type AgentRpcClientFactory = typeof makeAgentRpcProtocolClient;
export type AgentRpcProtocolClient = AgentRpcClientFactory extends Effect.Effect<infer Client, unknown, unknown> ? Client : never;

interface ITransportSession {
  readonly clientPromise: Promise<AgentRpcProtocolClient>;
  readonly clientScope: Scope.Closeable;
  readonly runtime: ManagedRuntime.ManagedRuntime<RpcClient.Protocol, never>;
}

type AgentRpcSocketUrlProvider = string | (() => string);

function normalizeHttpUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function resolveAgentDesktopServerUrl(): string {
  const currentUrl = new URL(window.location.href);
  const searchParamUrl = currentUrl.searchParams.get(SERVER_URL_SEARCH_PARAM);
  return searchParamUrl ? normalizeHttpUrl(searchParamUrl) : window.location.origin;
}

function resolveAgentDesktopWsUrl(): string {
  const serverUrl = new URL(resolveAgentDesktopServerUrl());
  serverUrl.protocol = serverUrl.protocol === "https:" ? "wss:" : "ws:";
  serverUrl.pathname = "/ws";
  serverUrl.search = "";
  serverUrl.hash = "";
  return serverUrl.toString();
}

export interface IAgentRpcClient {
  readonly dispose: () => Promise<void>;
  readonly fork: <TSuccess, TError>(execute: (client: AgentRpcProtocolClient) => Effect.Effect<TSuccess, TError, never>) => Promise<IAgentRpcClientFiber>;
  readonly run: <TSuccess, TError>(execute: (client: AgentRpcProtocolClient) => Effect.Effect<TSuccess, TError, never>) => Promise<TSuccess>;
}

export interface IAgentRpcClientFiber {
  readonly interrupt: () => Promise<void>;
}

export function createAgentRpcProtocolLayer(socketUrl: AgentRpcSocketUrlProvider = resolveAgentDesktopWsUrl) {
  const resolvedSocketUrl =
    typeof socketUrl === "function"
      ? Effect.sync(socketUrl).pipe(
          Effect.map((url) => {
            const resolvedUrl = new URL(url);
            resolvedUrl.pathname = "/ws";
            return resolvedUrl.toString();
          }),
          Effect.orDie
        )
      : socketUrl;
  const socketConstructorLayer = Layer.succeed(Socket.WebSocketConstructor, (url, protocols) => new globalThis.WebSocket(url, protocols));
  const socketLayer = Socket.layerWebSocket(resolvedSocketUrl).pipe(Layer.provide(socketConstructorLayer));
  const protocolLayer = RpcClient.layerProtocolSocket({retryTransientErrors: true});

  return protocolLayer.pipe(Layer.provide(Layer.mergeAll(socketLayer, RpcSerialization.layerJson)));
}

class AgentRpcClient implements IAgentRpcClient {
  private readonly session: ITransportSession;

  constructor(socketUrl: AgentRpcSocketUrlProvider) {
    const runtime = ManagedRuntime.make(createAgentRpcProtocolLayer(socketUrl));
    const clientScope = runtime.runSync(Scope.make());
    this.session = {
      clientPromise: runtime.runPromise(Scope.provide(clientScope)(makeAgentRpcProtocolClient)),
      clientScope,
      runtime,
    };
  }

  async dispose(): Promise<void> {
    await this.session.runtime.runPromise(Scope.close(this.session.clientScope, Exit.void));
    this.session.runtime.dispose();
  }

  async fork<TSuccess, TError>(execute: (client: AgentRpcProtocolClient) => Effect.Effect<TSuccess, TError, never>): Promise<IAgentRpcClientFiber> {
    const client = await this.session.clientPromise;
    const fiber = this.session.runtime.runFork(Effect.suspend(() => execute(client)));

    return {
      interrupt: () => this.session.runtime.runPromise(Fiber.interrupt(fiber).pipe(Effect.ignore)),
    };
  }

  async run<TSuccess, TError>(execute: (client: AgentRpcProtocolClient) => Effect.Effect<TSuccess, TError, never>): Promise<TSuccess> {
    const client = await this.session.clientPromise;
    return this.session.runtime.runPromise(Effect.suspend(() => execute(client)));
  }
}

export function createAgentRpcClient(socketUrl: AgentRpcSocketUrlProvider = resolveAgentDesktopWsUrl): IAgentRpcClient {
  return new AgentRpcClient(socketUrl);
}
