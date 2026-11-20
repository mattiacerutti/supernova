import type {ConnectionState, Contract, Host, ParamsOf} from "@earendil-works/chord";

import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {ConfigurationService} from "@supernova/contracts/services/configuration/services";
import {ExtensionsService} from "@supernova/contracts/services/extensions/services";
import {FoldersService} from "@supernova/contracts/services/folders/services";
import {ChatService} from "@supernova/contracts/services/chat/services";
import {SessionsService, SessionStatusService} from "@supernova/contracts/services/sessions/services";
import {TerminalService, WorkspaceService} from "@supernova/contracts/services/workspace/services";
import type {OwnerOf} from "@/runtime/references";
import {asOwner} from "@/runtime/references";

const context = BACKGROUND_CONTEXT;

type Members<C extends Contract> = Omit<OwnerOf<C>, "variant" | "state" | "retry" | "release">;

export type ConfigurationOwner = Members<typeof ConfigurationService>;
export type ExtensionsOwner = Members<typeof ExtensionsService>;
export type FoldersOwner = Members<typeof FoldersService>;
export type WorkspaceOwner = Members<typeof WorkspaceService>;
export type SessionStatusOwner = Members<typeof SessionStatusService>;
export type SessionsOwner = Members<typeof SessionsService>;
export type ChatOwner = Members<typeof ChatService>;
export type TerminalOwner = Members<typeof TerminalService>;

export interface RuntimeClient {
  readonly host: Host<RuntimePrincipal>;
  readonly configuration: ConfigurationOwner;
  readonly extensions: ExtensionsOwner;
  readonly folders: FoldersOwner;
  readonly workspace: WorkspaceOwner;
  readonly status: SessionStatusOwner;
  readonly sessions: SessionsOwner;
  terminalSocketUrl(token: string): string;
  onConnectionChange(listener: (state: ConnectionState) => void): () => void;
  dispose(): Promise<void>;
}

interface RuntimeConnection {
  readonly connect: (onState: (state: ConnectionState) => void) => () => void;
  readonly terminalSocketUrl: (token: string) => string;
}

export function runtimeClient(host: Host<RuntimePrincipal>, {connect, terminalSocketUrl}: RuntimeConnection): RuntimeClient {
  const listeners = new Set<(state: ConnectionState) => void>();
  const stop = connect((state) => {
    for (const listener of [...listeners]) listener(state);
  });
  void host.load([], context);

  const held = new Map<string, unknown>();
  const service = <C extends Contract>(Type: C, params: ParamsOf<C>): Members<C> => {
    let ref = held.get(Type.name) as Members<C> | undefined;
    if (!ref) {
      ref = asOwner(host.hold(Type, params, context));
      held.set(Type.name, ref);
    }
    return ref;
  };
  const clientId = crypto.randomUUID();

  return {
    host,
    get configuration() {
      return service(ConfigurationService, {});
    },
    get extensions() {
      return service(ExtensionsService, {});
    },
    get folders() {
      return service(FoldersService, {});
    },
    get workspace() {
      return service(WorkspaceService, {});
    },
    get status() {
      return service(SessionStatusService, {});
    },
    get sessions() {
      return service(SessionsService, {clientId});
    },
    terminalSocketUrl,
    onConnectionChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async dispose() {
      stop();
      await host.close(context);
    },
  };
}
