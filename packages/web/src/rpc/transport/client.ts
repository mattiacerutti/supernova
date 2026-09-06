import {Cause, Effect, Exit, Fiber, Layer, ManagedRuntime} from "effect";
import {RpcClient as EffectRpcClient, RpcSerialization} from "effect/unstable/rpc";
import * as Socket from "effect/unstable/socket/Socket";
import {RpcProtocolClientService, makeRpcProtocolClient} from "@/rpc/transport/protocol";
import type {RpcClient, RpcExecute, RpcRunOptions} from "@/rpc/transport/protocol";
import {resolveSocketUrl} from "@/rpc/transport/endpoint";

export {RpcProtocolClientService} from "@/rpc/transport/protocol";
export type {RpcClient, RpcClientFiber, RpcProtocolClient} from "@/rpc/transport/protocol";

function executeWithClient<A, E>(execute: RpcExecute<A, E>) {
  return Effect.flatMap(RpcProtocolClientService.asEffect(), (client) => Effect.suspend(() => execute(client)));
}

/** Owns one endpoint and its transport scope. Disposing it cancels all outstanding requests. */
export function createRpcClient(endpoint: string): RpcClient {
  const constructor = Layer.succeed(Socket.WebSocketConstructor, (url, protocols) => new globalThis.WebSocket(url, protocols));
  const socket = Socket.layerWebSocket(resolveSocketUrl(endpoint)).pipe(Layer.provide(constructor));

  const protocol = EffectRpcClient.layerProtocolSocket({retryTransientErrors: true}).pipe(Layer.provide(Layer.merge(socket, RpcSerialization.layerJson)));
  const client = Layer.effect(RpcProtocolClientService)(makeRpcProtocolClient).pipe(Layer.provide(protocol));
  const runtime = ManagedRuntime.make(client);

  const runExit = <A, E>(execute: RpcExecute<A, E>, options?: RpcRunOptions): Promise<Exit.Exit<A, E>> => {
    return runtime.runPromiseExit(executeWithClient(execute), options);
  };

  return {
    runExit,

    async run(execute) {
      const exit = await runExit(execute);
      if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);

      return exit.value;
    },

    async fork(execute) {
      const fiber = runtime.runFork(executeWithClient(execute));

      return {
        completed: runtime.runPromise(Fiber.await(fiber)).then(() => undefined),
        interrupt: () => runtime.runPromise(Fiber.interrupt(fiber).pipe(Effect.asVoid)),
      };
    },

    dispose: () => runtime.dispose(),
  };
}

let sharedClient: RpcClient | undefined;

/** Initializes the app's local endpoint; connection selection can supply a different endpoint at this boundary. */
export async function getRpcClient(): Promise<RpcClient> {
  sharedClient ??= createRpcClient(window.desktopApi?.serverUrl ?? import.meta.env.VITE_SUPERNOVA_SERVER_URL ?? window.location.origin);

  return sharedClient;
}
