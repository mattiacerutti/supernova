import {Type} from "typebox";
import type {TUnsafe} from "typebox";
import type {GenericError} from "@supernova/contracts/lib/errors";

/** The Chord host name of a Supernova server: clients reach its services `at` it. */
export const RUNTIME_HOST = "server";

/** Path of the runtime's WebSocket. */
export const RUNTIME_SOCKET_PATH = "/ws";

/** Why a runtime call failed, as it crosses the wire: the contract error's tag and its message. */
export interface ServiceFailure<Code extends string = string> {
  readonly code: Code;
  readonly message: string;
}

/**
 * The outcome of a runtime call. `E` is the contract errors the method declares, as their classes' instance types
 * (`ServiceResult<null, CheckpointNavigationError>`); every other failure arrives as a `GenericError`. Failures are
 * results rather than thrown errors: Chord carries only its own error codes, and clients need the contract's.
 */
export type ServiceResult<T, E extends {readonly _tag: string} = never> =
  | {readonly ok: true; readonly value: T}
  | {readonly ok: false; readonly error: ServiceFailure<E["_tag"] | GenericError["_tag"]>};

/**
 * A contract member's value, typed but unchecked by Chord. The server parses every payload with its Zod schema at the
 * boundary, and results and state are its own, so a second, TypeBox copy of each schema would only drift.
 */
export const json = <T>(): TUnsafe<T> => Type.Unsafe<T>({});

/** A method's `ServiceResult`, with the contract errors it declares. */
export const result = <T, E extends {readonly _tag: string} = never>(): TUnsafe<ServiceResult<T, E>> => json<ServiceResult<T, E>>();

/** The argument of a method without a payload; callers pass `null`. */
export const NO_PAYLOAD = Type.Null();

/** The input of a service the server offers once: every client reaches the same object. */
export const SERVER_WIDE = Type.Object({});
