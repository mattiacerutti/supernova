import type {Schema} from "@earendil-works/chord";
import {hostKind, str, unknown} from "@earendil-works/chord";

export const ServerHost = hostKind("server");
export const SessionHost = hostKind("session", {id: str()});

export const serverHost = () => ServerHost();
export const sessionHost = ({sessionId}: {readonly sessionId: string}) => SessionHost({id: sessionId});

export type RuntimePrincipal = {readonly kind: "owner"} | {readonly kind: "server"} | {readonly kind: "worker"; readonly sessionId: string; readonly generation: number};

export const RUNTIME_SOCKET_PATH = "/ws";

/** A typed schema that Chord does not check. */
export const json = <T>(): Schema<T> => unknown() as Schema<T>;
