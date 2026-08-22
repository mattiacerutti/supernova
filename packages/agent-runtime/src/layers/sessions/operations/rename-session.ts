import {Effect} from "effect";
import {RenameSessionError} from "@supernova/contracts/sessions/procedures";
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

        const sessionManager = await sessionStore.openSessionById(input.sessionId);
        sessionManager.appendSessionInfo(trimmedTitle);

        const sessionContext = sessionManager.buildSessionContext();
        const modelReference = sessionContext.model
          ? {id: sessionContext.model.modelId, providerId: sessionContext.model.provider, thinkingLevel: sessionContext.thinkingLevel}
          : undefined;

        if (!modelReference) {
          return {
            id: sessionManager.getSessionId(),
            context: {usedTokens: 0, contextWindow: 0},
            projectPath: sessionManager.getCwd(),
            title: trimmedTitle,
            turns: [],
            undoneTurns: [],
            updatedAt: new Date().toISOString(),
          };
        }

        return buildSessionSnapshot({contextWindow: resolveModelContextWindow(modelCatalog, modelReference), sessionManager, modelReference});
      },
      catch: (cause) => new RenameSessionError({cause, message: cause instanceof Error ? cause.message : "Failed to rename session."}),
    });
  });
}
