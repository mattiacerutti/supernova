import {Effect} from "effect";
import {LoadSessionError} from "@supernova/contracts/sessions/procedures";
import {PiModelCatalog} from "@supernova/agent-runtime/layers/shared/internal/pi-model-catalog";
import {PiSessionStore} from "@supernova/agent-runtime/layers/shared/internal/pi-session-store";
import {resolveModelContextWindow} from "@supernova/agent-runtime/layers/shared/lib/models/context-window";
import {buildSessionContextUsage} from "@supernova/agent-runtime/layers/session-runtime/lib/session-context-usage";
import {buildPiTurns} from "@supernova/agent-runtime/layers/shared/lib/turns-builder";
import {buildUndoneTurns, sessionTitle, sessionUpdatedAt} from "@supernova/agent-runtime/layers/session-runtime/lib/session-snapshot";

/** Loads one Pi session and maps it into the shared session detail contract. */
export function getSession(sessionId: string) {
  return Effect.gen(function* () {
    const modelCatalog = yield* PiModelCatalog;
    const sessionStore = yield* PiSessionStore;

    return yield* Effect.tryPromise({
      try: async () => {
        const sessionManager = await sessionStore.openSessionById(sessionId);
        const sessionContext = sessionManager.buildSessionContext();
        const branch = sessionManager.getBranch();

        const modelReference = sessionContext.model
          ? {id: sessionContext.model.modelId, providerId: sessionContext.model.provider, thinkingLevel: sessionContext.thinkingLevel}
          : undefined;
        const contextWindow = resolveModelContextWindow(modelCatalog, modelReference);
        const turns = modelReference ? buildPiTurns(branch, modelReference) : [];

        return {
          id: sessionManager.getSessionId(),
          modelReference,
          context: buildSessionContextUsage({contextWindow, entries: branch, messages: sessionContext.messages}),
          projectPath: sessionManager.getCwd(),
          title: sessionTitle(sessionManager, branch),
          turns,
          undoneTurns: modelReference ? buildUndoneTurns({modelReference, sessionManager}) : [],
          updatedAt: sessionUpdatedAt(sessionManager, turns),
        };
      },
      catch: (cause) => new LoadSessionError({cause, message: cause instanceof Error ? cause.message : "Failed to load session."}),
    });
  });
}
