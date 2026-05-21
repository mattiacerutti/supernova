import {Effect} from "effect";
import {LoadSessionError} from "@supernova/contracts/sessions/procedures";
import {PiSdkService} from "@supernova/agent-runtime/implementations/pi/pi-sdk";
import {toPiSessionSummary} from "@supernova/agent-runtime/implementations/pi/projects/pi-session-mapper";
import {findSessionById} from "@supernova/agent-runtime/implementations/pi/sessions/lib/session-resolver";
import {buildPiTurns} from "@supernova/agent-runtime/implementations/pi/sessions/lib/turns-builder";

export function getSession(sessionId: string) {
  return Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return yield* Effect.tryPromise({
      try: async () => {
        const sessionInfo = await findSessionById(piSdk, sessionId);
        const sessionManager = piSdk.SessionManager.open(sessionInfo.path);
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
