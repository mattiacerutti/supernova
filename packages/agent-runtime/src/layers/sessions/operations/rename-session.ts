import {Effect} from "effect";
import {RenameSessionError} from "@supernova/contracts/sessions/procedures";
import {toPiSessionSummary} from "@supernova/agent-runtime/layers/projects/pi-session-mapper";
import {PiSessionStore} from "@supernova/agent-runtime/layers/shared/internal/pi-session-store";
import {buildPiTurns} from "@supernova/agent-runtime/layers/shared/lib/turns-builder";
import {buildUndoneTurns} from "@supernova/agent-runtime/layers/session-runtime/lib/session-snapshot";

/** Renames a Pi session by appending a session metadata entry. */
export function renameSession(input: {readonly sessionId: string; readonly title: string}) {
  return Effect.gen(function* () {
    const sessionStore = yield* PiSessionStore;

    return yield* Effect.tryPromise({
      try: async () => {
        const trimmedTitle = input.title.trim();
        if (trimmedTitle.length === 0) throw new Error("Session title cannot be empty.");

        const {info: sessionInfo, manager: sessionManager} = await sessionStore.openSessionById(input.sessionId);
        sessionManager.appendSessionInfo(trimmedTitle);

        const sessionContext = sessionManager.buildSessionContext();
        const branch = sessionManager.getBranch();
        const summary = toPiSessionSummary({...sessionInfo, modified: new Date(), name: trimmedTitle});
        const model = sessionContext.model ? {id: sessionContext.model.modelId, providerId: sessionContext.model.provider, thinkingLevel: sessionContext.thinkingLevel} : undefined;

        return {
          id: sessionInfo.id,
          model,
          projectPath: sessionInfo.cwd,
          title: summary.title,
          turns: model ? buildPiTurns(branch, model) : [],
          undoneTurns: model ? buildUndoneTurns({modelReference: model, sessionManager}) : [],
          updatedAt: summary.updatedAt,
        };
      },
      catch: (cause) => new RenameSessionError({cause, message: cause instanceof Error ? cause.message : "Failed to rename session."}),
    });
  });
}
