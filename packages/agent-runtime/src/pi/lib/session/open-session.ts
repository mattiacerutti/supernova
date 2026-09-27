import {readdir} from "node:fs/promises";
import {join} from "node:path";
import {getAgentDir} from "@earendil-works/pi-coding-agent";
import type {PiSdk, PiSessionManager} from "@supernova/agent-runtime/pi/sdk";

/**
 * Pi names session files `<timestamp>_<sessionId>.jsonl` under one folder per project, so a session can be located
 * by suffix without parsing every file.
 */
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

/** Opens a session by id. Fast path by filename; falls back to Pi's full listing when the file is elsewhere. */
export async function openSessionById(sdk: Pick<PiSdk, "SessionManager">, sessionId: string): Promise<PiSessionManager> {
  const path = (await findPiSessionPath(sessionId)) ?? (await sdk.SessionManager.listAll()).find((candidate) => candidate.id === sessionId)?.path;
  if (!path) throw new Error("Session not found.");

  const manager = sdk.SessionManager.open(path);
  if (manager.getSessionId() !== sessionId) throw new Error("Session not found.");
  return manager;
}
