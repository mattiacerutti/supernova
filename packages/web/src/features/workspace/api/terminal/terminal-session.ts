import type {TerminalEvent} from "@supernova/contracts/terminals/schemas";
import {Effect, Stream} from "effect";
import type {RpcClient} from "@/rpc/transport/protocol";
import {useRpcClient} from "@/rpc/use-rpc-client";

export interface OpenTerminalInput {
  readonly cols: number;
  readonly cwd: string;
  readonly id: string;
  readonly rows: number;
  readonly sessionId: string;
}

/** A connection to one server terminal: open or reattach, stream its events, send input, resize, close. */
export interface TerminalSession {
  readonly close: () => void;
  readonly resize: (cols: number, rows: number) => void;
  readonly write: (data: string) => void;
  /** Stops receiving events without ending the shell. */
  readonly detach: () => void;
}

interface AttachTerminalInput extends OpenTerminalInput {
  readonly onError: (message: string) => void;
  readonly onEvent: (event: TerminalEvent) => void;
}

function attachTerminal(rpcClient: RpcClient, input: AttachTerminalInput): TerminalSession {
  const {id, onError, onEvent} = input;
  let detached = false;
  let interrupt: (() => Promise<void>) | undefined;

  void rpcClient
    .run((rpc) => rpc.openTerminal({cols: input.cols, cwd: input.cwd, id, rows: input.rows, sessionId: input.sessionId}))
    .then(() =>
      rpcClient.fork((rpc) =>
        rpc.watchTerminal({id}).pipe(
          Stream.runForEach((event) => Effect.sync(() => !detached && onEvent(event))),
          Effect.catch((cause) => Effect.sync(() => !detached && onError(cause instanceof Error && cause.message ? cause.message : "The terminal connection was lost.")))
        )
      )
    )
    .then((fiber) => {
      if (detached) void fiber.interrupt();
      else interrupt = fiber.interrupt;
    })
    .catch((cause: unknown) => {
      if (!detached) onError(cause instanceof Error && cause.message ? cause.message : "Failed to start the terminal.");
    });

  return {
    close: () => void rpcClient.run((rpc) => rpc.closeTerminal({id})).catch(() => undefined),
    detach: () => {
      detached = true;
      void interrupt?.();
    },
    resize: (cols, rows) => void rpcClient.run((rpc) => rpc.resizeTerminal({cols, id, rows})).catch(() => undefined),
    write: (data) => void rpcClient.run((rpc) => rpc.writeTerminal({data, id})).catch(() => undefined),
  };
}

/** Attaches to a server terminal. Call the returned function from a mount effect and `detach` on cleanup. */
export function useAttachTerminal(): (input: AttachTerminalInput) => TerminalSession {
  const rpcClient = useRpcClient();
  return (input) => attachTerminal(rpcClient, input);
}

/** Ids of the shells the server still runs for a session; a reloaded client reattaches tabs to them. */
export function useListTerminalIds(): (sessionId: string) => Promise<readonly string[]> {
  const rpcClient = useRpcClient();
  return async (sessionId) => (await rpcClient.run((rpc) => rpc.listTerminals({sessionId}))).terminals.map((terminal) => terminal.id);
}

/** Kills a terminal by id; for closing a tab, where no component is attached anymore. */
export function useCloseTerminal(): (id: string) => void {
  const rpcClient = useRpcClient();
  return (id) => void rpcClient.run((rpc) => rpc.closeTerminal({id})).catch(() => undefined);
}
