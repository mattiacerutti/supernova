import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import type {HistorySide} from "@supernova/contracts/services/chat/procedures";
import type {ChatService} from "@supernova/contracts/services/chat/services";
import type {ChatDocument} from "@supernova/contracts/services/chat/schemas";
import {withHistoryPage, withKnownBranch} from "@/features/sessions/lib/history-merge";
import type {ChatOwner, RuntimeClient} from "@/runtime/client";
import type {OwnerOf} from "@/runtime/references";
import {follow, whenLive} from "@/runtime/references";

export interface ChatHistorySnapshot {
  readonly document: ChatDocument | undefined;
  readonly loadError: string | undefined;
}

const EMPTY: ChatHistorySnapshot = {document: undefined, loadError: undefined};

// Sessions nothing uses keep their loaded pages, so going back finds them; past this many, the oldest drop them.
const KEPT_UNUSED = 4;

/** A session's chat document as this client has it: each value its held chats publish, joined with the pages loaded since. */
export class ChatHistory {
  private readonly listeners = new Set<() => void>();
  private users = 0;
  private snapshot: ChatHistorySnapshot = EMPTY;

  public constructor(
    private readonly sessionId: string,
    private readonly onUnused: (history: ChatHistory) => void
  ) {}

  public get used(): boolean {
    return this.users > 0;
  }

  public readonly read = (): ChatHistorySnapshot => this.snapshot;

  public readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return this.use(() => this.listeners.delete(listener));
  };

  public follow(chat: OwnerOf<typeof ChatService>): () => void {
    let following = true;
    whenLive(chat).catch((cause: unknown) => {
      if (following) this.set({...this.snapshot, loadError: cause instanceof Error ? cause.message : "Unable to load this session."});
    });
    const stop = follow(chat.document, (document) => {
      if (document?.id === this.sessionId) this.set({document: withKnownBranch(this.snapshot.document, document), loadError: undefined});
    });
    return this.use(() => {
      following = false;
      stop();
    });
  }

  // A session this client is creating has no chat to hold until the server created it.
  public seed(document: ChatDocument): void {
    if (!this.snapshot.document) this.set({...this.snapshot, document});
  }

  public async loadPage(chat: ChatOwner, side: HistorySide): Promise<void> {
    const document = this.snapshot.document;
    const edge = side === "entries" ? document?.entries.items[0]?.id : document?.undone.items.at(-1)?.id;
    if (edge === undefined) return;
    const page = await chat.loadHistory({side, edge}, context);
    const current = this.snapshot.document;
    if (current) this.set({...this.snapshot, document: withHistoryPage(current, side, edge, page)});
  }

  public clear(): void {
    if (this.snapshot !== EMPTY) this.set(EMPTY);
  }

  private use(stop: () => void): () => void {
    this.users += 1;
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      stop();
      this.users -= 1;
      if (this.users === 0) this.onUnused(this);
    };
  }

  private set(snapshot: ChatHistorySnapshot): void {
    this.snapshot = snapshot;
    for (const listener of [...this.listeners]) listener();
  }
}

// Each map is in the order its histories were last used, oldest first. Past the limit a history is cleared, not removed,
// so whoever already has it stays on the one history of its session.
const registries = new WeakMap<RuntimeClient, Map<string, ChatHistory>>();

function dropUnusedPastLimit(histories: Map<string, ChatHistory>, unused: ChatHistory, sessionId: string): void {
  histories.delete(sessionId);
  histories.set(sessionId, unused);
  const holding = [...histories.values()].filter((history) => !history.used && history.read().document !== undefined);
  for (const history of holding.slice(0, -KEPT_UNUSED)) history.clear();
}

/** The one history of `sessionId` on this client. */
export function historyOf(runtime: RuntimeClient, sessionId: string): ChatHistory {
  let histories = registries.get(runtime);
  if (!histories) {
    histories = new Map();
    registries.set(runtime, histories);
  }
  let history = histories.get(sessionId);
  if (!history) {
    const registry = histories;
    history = new ChatHistory(sessionId, (unused) => dropUnusedPastLimit(registry, unused, sessionId));
    histories.set(sessionId, history);
  }
  return history;
}
