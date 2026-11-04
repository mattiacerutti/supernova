import type {Schema} from "@earendil-works/chord";
import {hostKind, str, unknown} from "@earendil-works/chord";
import type {GenericError} from "@supernova/contracts/lib/errors";

export const ServerHost = hostKind("server");
export const SessionHost = hostKind("session", {id: str()});

export const serverHost = () => ServerHost();
export const sessionHost = ({sessionId}: {readonly sessionId: string}) => SessionHost({id: sessionId});

/** The server's session route stamps a session host's principal, with its start generation. */
export type RuntimePrincipal = {readonly kind: "owner"} | {readonly kind: "server"} | {readonly kind: "worker"; readonly sessionId: string; readonly generation: number};

export const RUNTIME_SOCKET_PATH = "/ws";

export interface ServiceFailure<Code extends string = string> {
  readonly code: Code;
  readonly message: string;
}

/** Failures are results, not thrown: Chord carries only its own error codes, and clients need the contract's. */
export type ServiceResult<T, E extends {readonly _tag: string} = never> =
  | {readonly ok: true; readonly value: T}
  | {readonly ok: false; readonly error: ServiceFailure<E["_tag"] | GenericError["_tag"]>};

/** Typed but unchecked by Chord; the server's Zod parse is the one boundary check, a second schema would only drift. */
export const json = <T>(): Schema<T> => unknown() as Schema<T>;

export const result = <T, E extends {readonly _tag: string} = never>(): Schema<ServiceResult<T, E>> => json<ServiceResult<T, E>>();
