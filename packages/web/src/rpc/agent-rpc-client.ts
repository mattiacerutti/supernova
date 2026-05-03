import {AGENT_RPC_METHODS, AgentRpcGroup} from "@pi-desktop/contracts";
import type {IAgentProjectsListResult} from "@pi-desktop/contracts";
import {Effect, Exit, Layer, ManagedRuntime, Scope} from "effect";
import {RpcClient, RpcSerialization} from "effect/unstable/rpc";
import * as Socket from "effect/unstable/socket/Socket";

const SERVER_URL_SEARCH_PARAM = "agentDesktopServerUrl";
const SERVER_URL_STORAGE_KEY = "agent-desktop-server-url";

const makeAgentRpcProtocolClient = RpcClient.make(AgentRpcGroup);
type AgentRpcClientFactory = typeof makeAgentRpcProtocolClient;
type AgentRpcProtocolClient = AgentRpcClientFactory extends Effect.Effect<infer Client, unknown, unknown> ? Client : never;

interface ITransportSession {
  readonly clientPromise: Promise<AgentRpcProtocolClient>;
  readonly clientScope: Scope.Closeable;
  readonly runtime: ManagedRuntime.ManagedRuntime<RpcClient.Protocol, never>;
}

type AgentRpcSocketUrlProvider = string | (() => Promise<string>);

interface IDesktopShellServerUrlBridge {
  getServerUrl?: () => Promise<string | undefined>;
}

function normalizeHttpUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

async function resolveAgentDesktopServerUrl(): Promise<string> {
  const currentUrl = new URL(window.location.href);
  const searchParamUrl = currentUrl.searchParams.get(SERVER_URL_SEARCH_PARAM);
  if (searchParamUrl) {
    const normalizedUrl = normalizeHttpUrl(searchParamUrl);
    window.sessionStorage.setItem(SERVER_URL_STORAGE_KEY, normalizedUrl);
    return normalizedUrl;
  }

  const storedUrl = window.sessionStorage.getItem(SERVER_URL_STORAGE_KEY);
  if (storedUrl) return storedUrl;

  const shell = window as Window & {desktopShell?: IDesktopShellServerUrlBridge};
  const shellServerUrl = await shell.desktopShell?.getServerUrl?.();
  if (shellServerUrl) {
    const normalizedUrl = normalizeHttpUrl(shellServerUrl);
    window.sessionStorage.setItem(SERVER_URL_STORAGE_KEY, normalizedUrl);
    return normalizedUrl;
  }

  return window.location.origin;
}

async function resolveAgentDesktopWsUrl(): Promise<string> {
  const serverUrl = new URL(await resolveAgentDesktopServerUrl());
  serverUrl.protocol = serverUrl.protocol === "https:" ? "wss:" : "ws:";
  serverUrl.pathname = "/ws";
  serverUrl.search = "";
  serverUrl.hash = "";
  return serverUrl.toString();
}

export interface IAgentRpcClient {
  readonly dispose: () => Promise<void>;
  readonly projects: {
    readonly list: () => Promise<IAgentProjectsListResult>;
  };
}

function createProtocolLayer(socketUrl: AgentRpcSocketUrlProvider) {
  const resolvedSocketUrl =
    typeof socketUrl === "function"
      ? Effect.promise(() => socketUrl()).pipe(
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
  const protocolLayer = Layer.effect(
    RpcClient.Protocol,
    RpcClient.makeProtocolSocket({
      retryTransientErrors: true,
    })
  );

  return protocolLayer.pipe(Layer.provide(Layer.mergeAll(socketLayer, RpcSerialization.layerJson)));
}

class AgentRpcClient implements IAgentRpcClient {
  private readonly session: ITransportSession;

  constructor(socketUrl: AgentRpcSocketUrlProvider) {
    const runtime = ManagedRuntime.make(createProtocolLayer(socketUrl));
    const clientScope = runtime.runSync(Scope.make());
    this.session = {
      clientPromise: runtime.runPromise(Scope.provide(clientScope)(makeAgentRpcProtocolClient)),
      clientScope,
      runtime,
    };
  }

  readonly projects = {
    list: () => this.request((client) => client[AGENT_RPC_METHODS.projectsList]({})),
  };

  async dispose(): Promise<void> {
    await this.session.runtime.runPromise(Scope.close(this.session.clientScope, Exit.void));
    this.session.runtime.dispose();
  }

  private async request<TSuccess>(execute: (client: AgentRpcProtocolClient) => Effect.Effect<TSuccess, unknown, never>): Promise<TSuccess> {
    const client = await this.session.clientPromise;
    return this.session.runtime.runPromise(Effect.suspend(() => execute(client)));
  }
}

export function createAgentRpcClient(socketUrl: AgentRpcSocketUrlProvider = resolveAgentDesktopWsUrl): IAgentRpcClient {
  return new AgentRpcClient(socketUrl);
}
