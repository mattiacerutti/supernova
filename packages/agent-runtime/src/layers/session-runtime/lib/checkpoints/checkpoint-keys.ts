import {createHash} from "node:crypto";

/** Hashes an identifier into the fixed-width, filesystem-safe form used for storage paths and ref names. */
export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Returns the ref prefix that holds every checkpoint of one session. */
export function checkpointSessionRefPrefix(sessionId: string): string {
  return `refs/supernova/${digest(sessionId)}/`;
}

/** Returns the private ref that pins one checkpoint's tree. */
export function checkpointRefName(sessionId: string, checkpointId: string): string {
  return `${checkpointSessionRefPrefix(sessionId)}${digest(checkpointId)}`;
}
