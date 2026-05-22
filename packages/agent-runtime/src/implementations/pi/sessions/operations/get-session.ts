import {Effect} from "effect";
import {LoadSessionError} from "@supernova/contracts/sessions/procedures";
import {toPiSessionSummary} from "@supernova/agent-runtime/implementations/pi/projects/pi-session-mapper";
import {PiSessionStore} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-session-store";
import {buildPiTurns} from "@supernova/agent-runtime/implementations/pi/sessions/lib/turns-builder";

/** Loads one Pi session and maps it into the shared session detail contract. */
export function getSession(sessionId: string) {
  return Effect.gen(function* () {
    const sessionStore = yield* PiSessionStore;

    return yield* Effect.tryPromise({
      try: async () => {
        const {info: sessionInfo, manager: sessionManager} = await sessionStore.openSessionById(sessionId);
        const sessionContext = sessionManager.buildSessionContext();
        const branch = sessionManager.getBranch();
        const summary = toPiSessionSummary(sessionInfo);

        const model = sessionContext.model ? {id: sessionContext.model.modelId, providerId: sessionContext.model.provider, thinkingLevel: sessionContext.thinkingLevel} : undefined;

        return {
          id: sessionInfo.id,
          model,
          projectPath: sessionInfo.cwd,
          title: summary.title,
          turns: model ? buildPiTurns(branch, model) : [],
          updatedAt: summary.updatedAt,
        };
      },
      catch: (cause) => new LoadSessionError({cause, message: cause instanceof Error ? cause.message : "Failed to load session."}),
    });
  });
}
