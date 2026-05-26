import {AgentRpcGroup} from "@supernova/contracts";
import {Cause, Context, Effect, Exit, Fiber, Layer, ManagedRuntime} from "effect";
import {RpcClient, RpcSerialization} from "effect/unstable/rpc";
import * as Socket from "effect/unstable/socket/Socket";

const makeAgentRpcProtocolClient = RpcClient.make(AgentRpcGroup);

export type AgentRpcProtocolClient = typeof makeAgentRpcProtocolClient extends Effect.Effect<infer Client, unknown, unknown> ? Client : never;
type AgentRpcExecute<TSuccess, TError> = (client: AgentRpcProtocolClient) => Effect.Effect<TSuccess, TError, never>;
type AgentRpcRunOptions = {readonly signal?: AbortSignal | undefined};

type AgentRpcRuntime = ManagedRuntime.ManagedRuntime<AgentRpcProtocolClientService, never>;

function resolveAgentDesktopWsUrl(): string {
  const serverUrl = new URL(window.location.origin);
  serverUrl.protocol = serverUrl.protocol === "https:" ? "wss:" : "ws:";
  serverUrl.pathname = "/ws";
  serverUrl.search = "";
  serverUrl.hash = "";
  return serverUrl.toString();
}

function isTransportFailure(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message.includes("SocketCloseError") || message.includes("Error in socket") || message.includes("OpenTimeout") || message.includes("1006");
}

class AgentRpcClient implements AgentRpcClientApi {
  private readonly socketUrl: string;
  private disposed = false;
  private reconnecting: Promise<void> = Promise.resolve();
  private runtime: AgentRpcRuntime;

  constructor(socketUrl: string) {
    this.socketUrl = socketUrl;
    this.runtime = this.createRuntime();
  }

  public async fork<TSuccess, TError>(execute: AgentRpcExecute<TSuccess, TError>): Promise<AgentRpcClientFiber> {
    const runtime = this.runtime;
    const effect = Effect.gen(function* () {
      const client = yield* AgentRpcProtocolClientService;
      return yield* Effect.suspend(() => execute(client));
    });
    const fiber = runtime.runFork(effect);

    return {
      completed: runtime.runPromise(Fiber.await(fiber)).then(async (exit) => {
        if (Exit.isFailure(exit) && isTransportFailure(Cause.squash(exit.cause))) await this.reconnect(runtime);
      }),
      interrupt: () => runtime.runPromise(Effect.ignore(Fiber.interrupt(fiber))),
    };
  }

  public async run<TSuccess, TError>(execute: AgentRpcExecute<TSuccess, TError>): Promise<TSuccess> {
    const exit = await this.runExit(execute);
    if (Exit.isSuccess(exit)) return exit.value;
    throw Cause.squash(exit.cause);
  }

  public async runExit<TSuccess, TError>(execute: AgentRpcExecute<TSuccess, TError>, options?: AgentRpcRunOptions): Promise<Exit.Exit<TSuccess, TError>> {
    const runtime = this.runtime;
    const effect = Effect.gen(function* () {
      const client = yield* AgentRpcProtocolClientService;
      return yield* Effect.suspend(() => execute(client));
    });
    const exit = await runtime.runPromiseExit(effect, options);

    if (Exit.isFailure(exit) && isTransportFailure(Cause.squash(exit.cause))) await this.reconnect(runtime);

    return exit as Exit.Exit<TSuccess, TError>;
  }

  public async dispose(): Promise<void> {
    this.disposed = true;
    await this.runtime.dispose();
  }

  private createRuntime(): AgentRpcRuntime {
    const socketConstructorLayer = Layer.succeed(Socket.WebSocketConstructor, (url, protocols) => new globalThis.WebSocket(url, protocols));
    const socketLayer = Layer.provide(Socket.layerWebSocket(this.socketUrl), socketConstructorLayer);
    const protocolRequirements = Layer.mergeAll(socketLayer, RpcSerialization.layerJson);
    const protocolLayer = Layer.provide(RpcClient.layerProtocolSocket({retryTransientErrors: true}), protocolRequirements);
    const clientLayer = Layer.provide(Layer.effect(AgentRpcProtocolClientService)(makeAgentRpcProtocolClient), protocolLayer);

    return ManagedRuntime.make(clientLayer);
  }

  private async reconnect(staleRuntime: AgentRpcRuntime): Promise<void> {
    if (this.disposed || staleRuntime !== this.runtime) return;

    const reconnect = this.reconnecting.then(async () => {
      if (this.disposed || staleRuntime !== this.runtime) return;

      this.runtime = this.createRuntime();
      await staleRuntime.dispose();
    });

    this.reconnecting = reconnect.catch(() => undefined);
    await reconnect;
  }
}

export class AgentRpcProtocolClientService extends Context.Service<AgentRpcProtocolClientService, AgentRpcProtocolClient>()("supernova/web/AgentRpcProtocolClientService") {}

export interface AgentRpcClientApi {
  readonly fork: <TSuccess, TError>(execute: AgentRpcExecute<TSuccess, TError>) => Promise<AgentRpcClientFiber>;
  readonly run: <TSuccess, TError>(execute: AgentRpcExecute<TSuccess, TError>) => Promise<TSuccess>;
  readonly runExit: <TSuccess, TError>(execute: AgentRpcExecute<TSuccess, TError>, options?: AgentRpcRunOptions) => Promise<Exit.Exit<TSuccess, TError>>;
  readonly dispose: () => Promise<void>;
}

export interface AgentRpcClientFiber {
  readonly completed: Promise<void>;
  readonly interrupt: () => Promise<void>;
}

const sharedAgentRpcClient = new AgentRpcClient(resolveAgentDesktopWsUrl());

export function getSharedAgentRpcClient(): AgentRpcClientApi {
  return sharedAgentRpcClient;
}
