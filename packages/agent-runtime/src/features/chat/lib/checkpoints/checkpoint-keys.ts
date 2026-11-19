import {createHash} from "node:crypto";

export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function checkpointSessionRefPrefix(sessionId: string): string {
  return `refs/supernova/${digest(sessionId)}/`;
}

export function checkpointRefName(sessionId: string, checkpointId: string): string {
  return `${checkpointSessionRefPrefix(sessionId)}${digest(checkpointId)}`;
}
