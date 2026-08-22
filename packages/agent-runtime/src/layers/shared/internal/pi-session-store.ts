import {readdir} from "node:fs/promises";
import {join} from "node:path";
import {getAgentDir} from "@earendil-works/pi-coding-agent";
import {Context, Effect, Layer} from "effect";
import {PiSdkService} from "@supernova/agent-runtime/layers/pi-sdk";
import type {PiSdkServiceShape} from "@supernova/agent-runtime/layers/pi-sdk";

export type PiSessionManager = ReturnType<PiSdkServiceShape["SessionManager"]["open"]>;

export interface PiSessionStoreShape {
  readonly createSessionManager: (projectPath: string) => PiSessionManager;
  readonly openSessionById: (sessionId: string) => Promise<PiSessionManager>;
}

export async function findPiSessionPath(sessionId: string, sessionsDir = join(getAgentDir(), "sessions")): Promise<string | undefined> {
  let projects;
  try {
    projects = await readdir(sessionsDir, {withFileTypes: true});
  } catch {
    return undefined;
  }

  const suffix = `_${sessionId}.jsonl`;

  const matches = (
    await Promise.all(
      projects
        .filter((project) => project.isDirectory() || project.isSymbolicLink())
        .map(async (project) => {
          const projectDir = join(sessionsDir, project.name);
          try {
            return (await readdir(projectDir)).filter((fileName) => fileName.endsWith(suffix)).map((fileName) => join(projectDir, fileName));
          } catch {
            return [];
          }
        })
    )
  ).flat();

  if (matches.length > 1) throw new Error("Multiple sessions found with the same ID.");
  return matches[0];
}

export class PiSessionStore extends Context.Service<PiSessionStore, PiSessionStoreShape>()("supernova/agent-runtime/PiSessionStore") {}

export const PiSessionStoreLive = Layer.effect(
  PiSessionStore,
  Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return {
      createSessionManager: (projectPath) => piSdk.SessionManager.create(projectPath),
      openSessionById: async (sessionId) => {
        // Pi has no way of getting a session by ID. We have to search the filesystem for the session file
        // (which has timestamp_sessionId.jsonl format) and then open it. Falls back to listAll()
        // (which is slower due to parsing all session files) if the session file is not found in the default sessions directory.
        const path = (await findPiSessionPath(sessionId)) ?? (await piSdk.SessionManager.listAll()).find((candidate) => candidate.id === sessionId)?.path;
        if (!path) throw new Error("Session not found.");

        const manager = piSdk.SessionManager.open(path);
        if (manager.getSessionId() !== sessionId) throw new Error("Session not found.");
        return manager;
      },
    };
  })
);
