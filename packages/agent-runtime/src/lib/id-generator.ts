import {createHash} from "node:crypto";

const ID_HASH_LENGTH = 16;

export function generateStableId(prefix: string, parts: readonly string[]): string {
  const hash = createHash("sha256");

  for (const part of parts) {
    hash.update(part.length.toString());
    hash.update(":");
    hash.update(part);
    hash.update(";");
  }

  return `${prefix}_${hash.digest("base64url").slice(0, ID_HASH_LENGTH)}`;
}
