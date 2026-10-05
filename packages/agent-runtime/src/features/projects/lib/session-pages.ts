import type {SessionSummary} from "@supernova/contracts/services/sessions/schemas";
import type {SessionRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";

/** What a page continues after: the last row's sort key. */
type CursorKey = Pick<SessionRecord, "id" | "pinned" | "updatedAt">;

/** A catalog record as a listing shows it. */
export function toSessionSummary(record: SessionRecord): SessionSummary {
  return {
    id: record.id,
    forked: record.forkedFrom !== undefined,
    // Untitled until the title arrives; the catalog does not hold the first message.
    title: record.title ?? "Untitled session",
    updatedAt: record.updatedAt,
    worktree: record.worktree !== undefined,
    pinned: record.pinned,
  };
}

/** The cursor that continues after `record`; opaque to clients. */
export function encodeCursor(record: CursorKey): string {
  return Buffer.from(JSON.stringify([record.pinned, record.updatedAt, record.id])).toString("base64url");
}

/** The sort key a cursor continues after. A cursor that does not decode is the client's error. */
export function decodeCursor(cursor: string): CursorKey {
  try {
    const [pinned, updatedAt, id] = JSON.parse(Buffer.from(cursor, "base64url").toString()) as unknown[];
    if (typeof pinned === "boolean" && typeof updatedAt === "string" && typeof id === "string") return {id, pinned, updatedAt};
  } catch {
    // Reported below.
  }
  throw new Error("The page cursor is invalid.");
}
