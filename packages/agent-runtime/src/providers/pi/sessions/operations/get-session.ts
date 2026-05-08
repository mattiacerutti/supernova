import {SessionManager} from "@mariozechner/pi-coding-agent";
import {Effect} from "effect";
import {AgentSessionLoadError} from "@pi-desktop/contracts/sessions";
import {toPiSessionSummary} from "@pi-desktop/agent-runtime/providers/pi/projects/pi-session-mapper";
import {findSessionById} from "@pi-desktop/agent-runtime/providers/pi/sessions/session-resolver";
import {normalizePiSessionTurns} from "@pi-desktop/agent-runtime/providers/pi/sessions/lib/session-mapper";

export function getSession(sessionId: string) {
  return Effect.tryPromise({
    try: async () => {
      const sessionInfo = await findSessionById(sessionId);
      const sessionManager = SessionManager.open(sessionInfo.path);
      const sessionContext = sessionManager.buildSessionContext();
      const summary = toPiSessionSummary(sessionInfo);
      const model = sessionContext.model ? {id: sessionContext.model.modelId, providerId: sessionContext.model.provider, thinkingLevel: sessionContext.thinkingLevel} : undefined;

      return {
        id: sessionInfo.id,
        model,
        projectPath: sessionInfo.cwd,
        title: summary.title,
        turns: model ? normalizePiSessionTurns(sessionContext.messages, model) : [],
        updatedAt: summary.updatedAt,
      };
    },
    catch: (cause) => new AgentSessionLoadError({cause, message: cause instanceof Error ? cause.message : "Failed to load session."}),
  });
}
