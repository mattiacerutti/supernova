import {writeFile} from "node:fs/promises";
import {Effect} from "effect";
import {AgentSessionLoadError} from "@pi-desktop/contracts/sessions";
import {PiSessionSdkService} from "@pi-desktop/agent-runtime/providers/pi/sessions/pi-session-sdk";

export function createSession(projectPath: string) {
  return Effect.gen(function* () {
    const sessionSdk = yield* PiSessionSdkService;

    return yield* Effect.tryPromise({
      try: async () => {
        const sessionManager = sessionSdk.createSessionManager(projectPath);
        const sessionFile = sessionManager.getSessionFile();
        const header = sessionManager.getHeader();

        if (!sessionFile || !header) throw new Error("Failed to create session.");

        await writeFile(sessionFile, `${JSON.stringify(header)}\n`, {flag: "wx"});

        return {
          id: sessionManager.getSessionId(),
          projectPath,
          title: "New session",
          turns: [],
          updatedAt: header.timestamp,
        };
      },
      catch: (cause) => new AgentSessionLoadError({cause, message: cause instanceof Error ? cause.message : "Failed to create session."}),
    });
  });
}
