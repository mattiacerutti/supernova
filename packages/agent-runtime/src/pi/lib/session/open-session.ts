import {readdir} from "node:fs/promises";
import {basename, join} from "node:path";
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

/** The id of the session stored at `path`, read from its `<timestamp>_<sessionId>.jsonl` file name. Timestamps contain no `_`. */
export function sessionIdFromPath(path: string): string | undefined {
  const fileName = basename(path);
  const separator = fileName.indexOf("_");
  if (separator === -1 || !fileName.endsWith(".jsonl")) return undefined;
  return fileName.slice(separator + 1, -".jsonl".length) || undefined;
}

/** The session this one was forked from. Pi records the parent's file path in the header. */
export function parentSessionId(sessionManager: PiSessionManager): string | undefined {
  const parentPath = sessionManager.getHeader()?.parentSession;
  return parentPath ? sessionIdFromPath(parentPath) : undefined;
}

/** The session file for an id, or undefined when no session has it. Fast path by filename, then Pi's full listing. */
export async function sessionPathById(sdk: Pick<PiSdk, "SessionManager">, sessionId: string): Promise<string | undefined> {
  return (await findPiSessionPath(sessionId)) ?? (await sdk.SessionManager.listAll()).find((candidate) => candidate.id === sessionId)?.path;
}

/** Opens a session by id. */
export async function openSessionById(sdk: Pick<PiSdk, "SessionManager">, sessionId: string): Promise<PiSessionManager> {
  const path = await sessionPathById(sdk, sessionId);
  if (!path) throw new Error("Session not found.");

  const manager = sdk.SessionManager.open(path);
  if (manager.getSessionId() !== sessionId) throw new Error("Session not found.");
  return manager;
}
