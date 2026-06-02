import {writeFile} from "node:fs/promises";
import {Effect} from "effect";
import {CreateSessionError} from "@supernova/contracts/sessions/procedures";
import {PiSessionStore} from "@supernova/agent-runtime/layers/shared/internal/pi-session-store";

/** Creates a new empty Pi session for a project. */
export function createSession(projectPath: string) {
  return Effect.gen(function* () {
    const sessionStore = yield* PiSessionStore;

    return yield* Effect.tryPromise({
      try: async () => {
        const sessionManager = sessionStore.createSessionManager(projectPath);
        const sessionFile = sessionManager.getSessionFile();
        const header = sessionManager.getHeader();

        if (!sessionFile || !header) throw new Error("Failed to create session.");

        await writeFile(sessionFile, `${JSON.stringify(header)}\n`, {flag: "wx"});

        return {
          id: sessionManager.getSessionId(),
          projectPath,
          title: "New session",
          turns: [],
          undoneTurns: [],
          updatedAt: header.timestamp,
        };
      },
      catch: (cause) => new CreateSessionError({cause, message: cause instanceof Error ? cause.message : "Failed to create session."}),
    });
  });
}
