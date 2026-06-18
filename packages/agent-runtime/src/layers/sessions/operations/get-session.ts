import {Effect} from "effect";
import {LoadSessionError} from "@supernova/contracts/sessions/procedures";
import {toPiSessionSummary} from "@supernova/agent-runtime/layers/projects/pi-session-mapper";
import {PiModelCatalog} from "@supernova/agent-runtime/layers/shared/internal/pi-model-catalog";
import {PiSessionStore} from "@supernova/agent-runtime/layers/shared/internal/pi-session-store";
import {resolveModelContextWindow} from "@supernova/agent-runtime/layers/shared/lib/models/context-window";
import {buildSessionContextUsage} from "@supernova/agent-runtime/layers/session-runtime/lib/session-context-usage";
import {buildPiTurns} from "@supernova/agent-runtime/layers/shared/lib/turns-builder";
import {buildUndoneTurns} from "@supernova/agent-runtime/layers/session-runtime/lib/session-snapshot";

/** Loads one Pi session and maps it into the shared session detail contract. */
export function getSession(sessionId: string) {
  return Effect.gen(function* () {
    const modelCatalog = yield* PiModelCatalog;
    const sessionStore = yield* PiSessionStore;

    return yield* Effect.tryPromise({
      try: async () => {
        const {info: sessionInfo, manager: sessionManager} = await sessionStore.openSessionById(sessionId);
        const sessionContext = sessionManager.buildSessionContext();
        const branch = sessionManager.getBranch();
        const summary = toPiSessionSummary(sessionInfo);

        const model = sessionContext.model ? {id: sessionContext.model.modelId, providerId: sessionContext.model.provider, thinkingLevel: sessionContext.thinkingLevel} : undefined;
        const contextWindow = resolveModelContextWindow(modelCatalog, model);

        return {
          id: sessionInfo.id,
          model,
          context: buildSessionContextUsage({contextWindow, entries: branch, messages: sessionContext.messages}),
          projectPath: sessionInfo.cwd,
          title: sessionManager.getSessionName() ?? summary.title,
          turns: model ? buildPiTurns(branch, model) : [],
          undoneTurns: model ? buildUndoneTurns({modelReference: model, sessionManager}) : [],
          updatedAt: summary.updatedAt,
        };
      },
      catch: (cause) => new LoadSessionError({cause, message: cause instanceof Error ? cause.message : "Failed to load session."}),
    });
  });
}
