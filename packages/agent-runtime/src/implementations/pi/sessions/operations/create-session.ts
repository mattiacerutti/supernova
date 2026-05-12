import {writeFile} from "node:fs/promises";
import {Effect} from "effect";
import {AgentSessionCreateError} from "@pi-desktop/contracts/sessions/procedures";
import {PiSdkService} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";

export function createSession(projectPath: string) {
  return Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return yield* Effect.tryPromise({
      try: async () => {
        const sessionManager = piSdk.SessionManager.create(projectPath);
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
      catch: (cause) => new AgentSessionCreateError({cause, message: cause instanceof Error ? cause.message : "Failed to create session."}),
    });
  });
}
