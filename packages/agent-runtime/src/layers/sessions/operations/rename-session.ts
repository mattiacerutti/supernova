import {Effect} from "effect";
import {RenameSessionError} from "@supernova/contracts/sessions/procedures";
import {toPiSessionSummary} from "@supernova/agent-runtime/layers/projects/pi-session-mapper";
import {PiModelCatalog} from "@supernova/agent-runtime/layers/shared/internal/pi-model-catalog";
import {PiSessionStore} from "@supernova/agent-runtime/layers/shared/internal/pi-session-store";
import {resolveModelContextWindow} from "@supernova/agent-runtime/layers/shared/lib/models/context-window";
import {buildSessionSnapshot} from "@supernova/agent-runtime/layers/session-runtime/lib/session-snapshot";

/** Renames a Pi session by appending a session metadata entry. */
export function renameSession(input: {readonly sessionId: string; readonly title: string}) {
  return Effect.gen(function* () {
    const modelCatalog = yield* PiModelCatalog;
    const sessionStore = yield* PiSessionStore;

    return yield* Effect.tryPromise({
      try: async () => {
        const trimmedTitle = input.title.trim();
        if (trimmedTitle.length === 0) throw new Error("Session title cannot be empty.");

        const {info: sessionInfo, manager: sessionManager} = await sessionStore.openSessionById(input.sessionId);
        sessionManager.appendSessionInfo(trimmedTitle);

        const updatedSessionInfo = {...sessionInfo, modified: new Date(), name: trimmedTitle};
        const sessionContext = sessionManager.buildSessionContext();
        const summary = toPiSessionSummary(updatedSessionInfo);
        const model = sessionContext.model ? {id: sessionContext.model.modelId, providerId: sessionContext.model.provider, thinkingLevel: sessionContext.thinkingLevel} : undefined;

        if (!model) {
          return {
            id: sessionInfo.id,
            context: {usedTokens: 0, contextWindow: 0},
            projectPath: sessionInfo.cwd,
            title: summary.title,
            turns: [],
            undoneTurns: [],
            updatedAt: summary.updatedAt,
          };
        }

        return buildSessionSnapshot({contextWindow: resolveModelContextWindow(modelCatalog, model), sessionInfo: updatedSessionInfo, sessionManager, modelReference: model});
      },
      catch: (cause) => new RenameSessionError({cause, message: cause instanceof Error ? cause.message : "Failed to rename session."}),
    });
  });
}
