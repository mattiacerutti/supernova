import {Type} from "typebox";
import type {TUnsafe} from "typebox";
import type {GenericError} from "@supernova/contracts/lib/errors";

export const RUNTIME_HOST = "server";

export const RUNTIME_SOCKET_PATH = "/ws";

export interface ServiceFailure<Code extends string = string> {
  readonly code: Code;
  readonly message: string;
}

/** Failures are results, not thrown: Chord carries only its own error codes, and clients need the contract's. */
export type ServiceResult<T, E extends {readonly _tag: string} = never> =
  | {readonly ok: true; readonly value: T}
  | {readonly ok: false; readonly error: ServiceFailure<E["_tag"] | GenericError["_tag"]>};

/** Typed but unchecked by Chord; the server's Zod parse is the one boundary check, a TypeBox copy would only drift. */
export const json = <T>(): TUnsafe<T> => Type.Unsafe<T>({});

export const result = <T, E extends {readonly _tag: string} = never>(): TUnsafe<ServiceResult<T, E>> => json<ServiceResult<T, E>>();

export const NO_PAYLOAD = Type.Null();

export const SERVER_WIDE = Type.Object({});
