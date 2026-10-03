import type {GenericError} from "@supernova/contracts/runtime/schemas";

/**
 * The logical identity of a Supernova server on the runtime protocol. A client checks it in the server's hello; the
 * server's URL already selects the server, so every Supernova server uses the same identity.
 */
export const RUNTIME_SERVER_ID = "3f8c2a64-5d1e-4b7a-9c2f-6e1d0a8b4c57";

/** Path of the runtime protocol's WebSocket. */
export const RUNTIME_SOCKET_PATH = "/ws";

/** Why a runtime call failed, as it crosses the wire: the contract error's tag and its message. */
export interface ServiceFailure<Code extends string = string> {
  readonly code: Code;
  readonly message: string;
}

/**
 * The outcome of a runtime call. `E` is the contract errors the method declares, as their classes' instance types
 * (`ServiceResult<null, CheckpointNavigationError>`); every other failure arrives as a `GenericError`. Failures are
 * results rather than thrown errors: the protocol carries only its own error codes, and clients need the contract's.
 */
export type ServiceResult<T, E extends {readonly _tag: string} = never> =
  | {readonly ok: true; readonly value: T}
  | {readonly ok: false; readonly error: ServiceFailure<E["_tag"] | GenericError["_tag"]>};
