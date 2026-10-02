/**
 * The logical identity of a Supernova server on the runtime protocol. A client checks it in the server's hello; the
 * server's URL already selects the server, so every Supernova server uses the same identity.
 */
export const RUNTIME_SERVER_ID = "3f8c2a64-5d1e-4b7a-9c2f-6e1d0a8b4c57";

/** Path of the runtime protocol's WebSocket. */
export const RUNTIME_SOCKET_PATH = "/ws";

/** Why a runtime call failed. `code` is the contract error class's tag, such as `CheckpointConflictError`. */
export interface ServiceFailure {
  readonly code: string;
  readonly message: string;
}

/**
 * The outcome of a runtime call. Expected failures are results rather than thrown errors: the protocol carries only
 * its own error codes, and clients need the contract's.
 */
export type ServiceResult<T> = {readonly ok: true; readonly value: T} | {readonly ok: false; readonly error: ServiceFailure};
