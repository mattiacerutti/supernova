import {local, method, nul} from "@earendil-works/chord";
import {json} from "@supernova/contracts/lib/protocol";
import type {ArchiveSessionResult} from "@supernova/contracts/services/sessions/procedures";
import {ArchiveSessionPayload, CreateSessionPayload, ForkSessionPayload} from "@supernova/contracts/services/sessions/procedures";
import type {ListedSession, SessionStatuses} from "@supernova/contracts/services/sessions/services";
import type {Sessions} from "@supernova/agent-runtime/features/sessions/natives/sessions";
import type {SessionStatus} from "@supernova/agent-runtime/features/sessions/natives/session-status";
import {nativeRegistry} from "@supernova/agent-runtime/lib/chord/natives";

export const SessionCatalogStore = local("supernova.store.session-catalog", {version: 1, params: {}, members: {revision: json<number>()}});
export const SessionsNative = nativeRegistry<Sessions>("supernova.native.sessions");

export const SessionStatusStore = local("supernova.store.session-status", {version: 1, params: {}, members: {statuses: json<SessionStatuses>()}});
export const SessionStatusNative = nativeRegistry<SessionStatus>("supernova.native.session-status");

// A local object's calls act as the server, which the session's chat serves its server variant to.
export const SessionOperations = local("supernova.session-operations", {
  version: 1,
  params: {},
  members: {
    create: method(CreateSessionPayload, nul()),
    fork: method(ForkSessionPayload, json<ListedSession>()),
    archive: method(ArchiveSessionPayload, json<ArchiveSessionResult>()),
  },
});
