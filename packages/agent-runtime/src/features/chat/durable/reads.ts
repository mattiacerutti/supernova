import type {Context} from "@earendil-works/chord/context";
import type {Conversation, ConversationId, ConversationView, EntryId, EntryRecord, Harness} from "@earendil-works/pi-durable";
import type {SessionState} from "@supernova/agent-runtime/core/session-state";
import {SessionStateDoc} from "@supernova/agent-runtime/core/session-state";

const UNOBSERVED = {advance: () => undefined, end: () => undefined};

// Only the session file writes.
export type HarnessReader = Pick<Harness, "conversation" | "observeConversation" | "observeDoc" | "snapshot" | "snapshotAsOf">;

export async function getState(harness: HarnessReader, context: Context): Promise<SessionState> {
  const state = (await harness.snapshot(SessionStateDoc, context)) as SessionState | undefined;
  return state ?? (SessionStateDoc.definition.initial() as SessionState);
}

export async function getConversationView(harness: HarnessReader, conversationId: ConversationId, context: Context): Promise<ConversationView> {
  const observation = await harness.observeConversation(conversationId, UNOBSERVED, context);
  observation.detach();
  return observation.value;
}

export async function getConversation(harness: HarnessReader, conversationId: ConversationId, context: Context): Promise<Conversation> {
  const conversation = await harness.conversation(conversationId, context);
  if (!conversation) throw new Error(`Conversation ${conversationId} does not exist.`);
  return conversation;
}

export async function getFirstEntryId(harness: HarnessReader, conversationId: ConversationId, context: Context): Promise<number | undefined> {
  const page = await (await getConversation(harness, conversationId, context)).entries({order: "ascending"}, 1, undefined, context);
  return page.items[0]?.id;
}

export async function getLastEntryId(harness: HarnessReader, conversationId: ConversationId, context: Context): Promise<number | undefined> {
  const page = await (await getConversation(harness, conversationId, context)).entries({}, 1, undefined, context);
  return page.items[0]?.id;
}

export async function getEntries(
  harness: HarnessReader,
  conversationId: ConversationId,
  range: {readonly after?: number; readonly through?: number},
  context: Context
): Promise<EntryRecord[]> {
  const conversation = await getConversation(harness, conversationId, context);
  const query = {
    ...(range.after === undefined ? {} : {minEntryId: (range.after + 1) as EntryId}),
    ...(range.through === undefined ? {} : {maxEntryId: range.through as EntryId}),
  };

  const items: EntryRecord[] = [];
  let cursor;
  do {
    // Durable's storage reads ignore cancellation, so a cancelled caller stops between them.
    context.abortSignal?.throwIfAborted();
    const page = await conversation.entries(query, 256, cursor, context);
    items.push(...page.items);
    cursor = page.next;
  } while (cursor !== undefined);
  return items.reverse();
}
