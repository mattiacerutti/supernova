import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {Conversation, ConversationId, ConversationView, EntryId, EntryRecord, Harness} from "@earendil-works/pi-durable";
import type {SessionState} from "@supernova/agent-runtime/core/session-state";
import {SessionStateDoc} from "@supernova/agent-runtime/core/session-state";

const context = BACKGROUND_CONTEXT;

const UNOBSERVED = {advance: () => undefined, end: () => undefined};

// Only the session file writes.
export type HarnessReader = Pick<Harness, "conversation" | "observeConversation" | "observeDoc" | "snapshot" | "snapshotAsOf">;

export async function getState(harness: HarnessReader): Promise<SessionState> {
  const state = (await harness.snapshot(SessionStateDoc, context)) as SessionState | undefined;
  return state ?? (SessionStateDoc.definition.initial() as SessionState);
}

export async function getConversationView(harness: HarnessReader, branch: number): Promise<ConversationView> {
  const observation = await harness.observeConversation(branch as ConversationId, UNOBSERVED, context);
  observation.detach();
  return observation.value;
}

export async function getConversation(harness: HarnessReader, branch: number): Promise<Conversation> {
  const conversation = await harness.conversation(branch as ConversationId, context);
  if (!conversation) throw new Error(`Conversation ${branch} does not exist.`);
  return conversation;
}

export async function getEntries(harness: HarnessReader, branch: number, range: {readonly after?: number; readonly through?: number} = {}): Promise<EntryRecord[]> {
  const conversation = await getConversation(harness, branch);
  const query = {
    ...(range.after === undefined ? {} : {minEntryId: (range.after + 1) as EntryId}),
    ...(range.through === undefined ? {} : {maxEntryId: range.through as EntryId}),
  };

  const items: EntryRecord[] = [];
  let cursor;
  do {
    const page = await conversation.entries(query, 256, cursor, context);
    items.push(...page.items);
    cursor = page.next;
  } while (cursor !== undefined);
  return items.reverse();
}
