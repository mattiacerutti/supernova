import type {Facet} from "@earendil-works/chord";
import {defineFacet, local, method as contractMethod} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {json} from "@supernova/contracts/lib/protocol";
import type {
  LoadHistoryResult,
  RedoCheckpointPayload as RedoCheckpointInput,
  RevertToMessagePayload as RevertToMessageInput,
  SendMessagePayload as SendMessageInput,
  CompactSessionPayload as CompactSessionInput,
  UndoCheckpointPayload as UndoCheckpointInput,
} from "@supernova/contracts/services/session-runtime/procedures";
import {
  CheckpointNavigationError,
  CompactSessionPayload,
  LoadHistoryPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  UndoCheckpointPayload,
} from "@supernova/contracts/services/session-runtime/procedures";
import {ChatService} from "@supernova/contracts/services/session-runtime/services";
import {SessionStatusService} from "@supernova/contracts/services/sessions/services";
import type {Session} from "@supernova/contracts/services/sessions/schemas";
import {action, method} from "@supernova/agent-runtime/lib/chord/methods";
import {forbidden} from "@supernova/agent-runtime/lib/chord/principals";
import {published} from "@supernova/agent-runtime/lib/chord/state";
import type {CheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
import {SessionWorker} from "@supernova/agent-runtime/features/session-runtime/worker/session-worker";
import type {TitleGenerator} from "@supernova/agent-runtime/features/session-runtime/worker/title-generator";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";
import type {SessionStore} from "@supernova/agent-runtime/pi/session-store";

/** Local calls keep thrown errors as they are, so `ChatService` maps contract errors once; it parses payloads too. */
export const SessionRuntime = local("supernova.session-runtime", {
  version: 1,
  params: {},
  members: {
    session: json<Session>(),
    /** Waits for every publication queued before the call. */
    current: contractMethod(undefined, json<Session>()),
    loadHistory: contractMethod(json<Omit<LoadHistoryPayload, "sessionId">>(), json<LoadHistoryResult>()),
    sendMessage: contractMethod(json<SendMessageInput>()),
    compact: contractMethod(json<CompactSessionInput>()),
    undoCheckpoint: contractMethod(json<UndoCheckpointInput>()),
    redoCheckpoint: contractMethod(json<RedoCheckpointInput>()),
    revertToMessage: contractMethod(json<RevertToMessageInput>()),
    abort: contractMethod(),
  },
});

export interface SessionRuntimeFacetDeps {
  readonly sessionId: string;
  readonly checkpointStore: CheckpointStore;
  readonly resourceCache: ResourceCache;
  readonly sdk: Pick<PiSdk, "modelRuntime">;
  readonly store: Pick<SessionStore, "file" | "find">;
  readonly titleGenerator: TitleGenerator;
}

export function sessionRuntimeFacet(deps: SessionRuntimeFacetDeps): Facet<RuntimePrincipal> {
  return defineFacet<RuntimePrincipal>((host) => {
    host.serve(SessionRuntime, (_params, self) => {
      const session = published<Session>(self, {} as Session);
      const status = self.get(SessionStatusService, {});
      const worker = self.open(
        (context) =>
          SessionWorker.open({
            ...deps,
            // Async, so a reference closed by the host's close rejects into the worker's catches instead of throwing.
            ports: {
              publish: async (next) => session.set(next),
              report: async (report) => {
                if (status.variant === "worker") await status.report(report, context);
              },
            },
          }),
        (opened) => opened.dispose()
      );
      return {
        session: session.member,
        current: async () => worker.value.current(),
        loadHistory: (input) => worker.value.loadHistory(input),
        sendMessage: async (input) => (await worker.value.sendMessage(input), null),
        compact: async (input) => (await worker.value.compact(input), null),
        undoCheckpoint: async (input) => (await worker.value.undoCheckpoint(input), null),
        redoCheckpoint: async (input) => (await worker.value.redoCheckpoint(input), null),
        revertToMessage: async (input) => (await worker.value.revertToMessage(input), null),
        abort: async () => (await worker.value.abort(), null),
      };
    });

    host.serve(ChatService, (_params, principal, self) => {
      const runtime = self.get(SessionRuntime, {});
      const {sessionId} = deps;
      if (principal.kind === "server") {
        return {
          variant: "server",
          members: {
            current: action({run: (ctx) => runtime.current(ctx)}),
            sendMessage: method({payload: SendMessagePayload.omit({sessionId: true}), run: (input, ctx) => runtime.sendMessage({...input, sessionId}, ctx)}),
          },
        };
      }
      if (principal.kind !== "owner") throw forbidden("Only the owner may use a session's chat.");
      return {
        variant: "owner",
        members: {
          session: runtime.session,
          loadHistory: method({payload: LoadHistoryPayload.omit({sessionId: true}), run: (input, ctx) => runtime.loadHistory(input, ctx)}),
          sendMessage: method({payload: SendMessagePayload.omit({sessionId: true}), run: (input, ctx) => runtime.sendMessage({...input, sessionId}, ctx)}),
          compact: method({payload: CompactSessionPayload.omit({sessionId: true}), run: (input, ctx) => runtime.compact({...input, sessionId}, ctx)}),
          undoCheckpoint: method({
            payload: UndoCheckpointPayload.omit({sessionId: true}),
            error: CheckpointNavigationError,
            run: (input, ctx) => runtime.undoCheckpoint({...input, sessionId}, ctx),
          }),
          redoCheckpoint: method({
            payload: UndoCheckpointPayload.omit({sessionId: true}),
            error: CheckpointNavigationError,
            run: (input, ctx) => runtime.redoCheckpoint({...input, sessionId}, ctx),
          }),
          revertToMessage: method({
            payload: RevertToMessagePayload.omit({sessionId: true}),
            error: CheckpointNavigationError,
            run: (input, ctx) => runtime.revertToMessage({...input, sessionId}, ctx),
          }),
          abort: action({run: (ctx) => runtime.abort(ctx).then(() => null)}),
        },
      };
    });
  });
}
