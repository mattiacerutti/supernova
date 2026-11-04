import type {CreateSessionPayload, SessionActivity} from "@supernova/contracts/services/sessions/procedures";
import type {LiveState, Session, UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";
import type {ProviderLoginsState} from "@supernova/contracts/services/providers/services";
import type {ServiceResult} from "@supernova/contracts/lib/protocol";
import type {ListedSession, SessionStatuses, SessionsView} from "@supernova/contracts/services/sessions/services";
import type {TerminalsState} from "@supernova/contracts/services/workspace/services";
import type {TerminalOutput} from "@supernova/contracts/services/workspace/schemas";
import type {ChatOwner, RuntimeClient, SessionsOwner} from "@/runtime/transport/runtime-client";
import type {FakeState} from "@tests/support/fake-state";
import {fakeState} from "@tests/support/fake-state";
import {assistantEntry, page, runningLive, transcript, userEntry} from "@tests/support/session";
import {createTimelineSessions, timelineModelDetails, timelineStreamContent, TIMELINE_PROJECT_PATH, TIMELINE_SESSION_ID} from "@tests/timeline/data";
import type {TimelineMockState} from "@tests/timeline/test-api";

export type {RuntimeClient} from "@/runtime/transport/runtime-client";

const STREAM_LINES_PER_FRAME = 2;
const ok = {ok: true, value: null} as const;

/** Resolves to a successful service result. */
const value = async <T>(result: T): Promise<ServiceResult<T>> => ({ok: true, value: result});

/**
 * The server side of the timeline tests, in the browser: sessions as local state, read through the same
 * runtime client interface the app uses with the real server.
 */
class TimelineServer {
  private readonly timeline = createTimelineSessions();
  private readonly records = new Map([...this.timeline.values()].map(({record}) => [record.id, record]));
  private readonly sessions = new Map([...this.timeline.values()].map(({session}) => [session.id, session]));
  private readonly documents = new Map<string, FakeState<Session>>();
  private readonly statuses = fakeState<SessionStatuses>({sessions: {}});
  private readonly view = fakeState<SessionsView>({projects: {}, open: null});
  private openId: string | null = null;
  private activeSessionId = TIMELINE_SESSION_ID;
  private lineCount = 0;
  private reasoningBreaks: number[] = [];
  private status: TimelineMockState["status"] = "idle";
  private streamFrame: number | null = null;
  private streamTargetLineCount = 0;

  public constructor() {
    window.__supernovaTimelineMock = {
      breakForReasoning: () => this.breakForReasoning(),
      completeStream: () => this.settleStream("completed"),
      emitLines: (lineCount) => this.emitLines(lineCount),
      getState: () => {
        const session = this.session(TIMELINE_SESSION_ID);
        const count = (entries: Session["entries"]) => entries.items.filter((entry) => entry.contentParts !== undefined).length;
        return {lineCount: this.lineCount, status: this.status, turnCount: count(session.entries), undoneTurnCount: count(session.undone)};
      },
    };
  }

  /** The runtime client the app uses, over this server's state. */
  public client(): RuntimeClient {
    // As on the server, a session runtime service is one session's, and holding an unknown one fails: its `ready`
    // rejects and its document never arrives.
    const missing = fakeState({} as Session);
    const chat = (sessionId: string): ChatOwner => ({
      session: this.sessions.has(sessionId) ? this.document(sessionId) : missing,
      abort: async () => (this.settleStream("aborted"), ok),
      compact: async () => ok,
      // Timeline sessions are one page; paging is the server's and covered by its tests.
      loadHistory: async () => ({ok: true, value: page([])}),
      redoCheckpoint: async () => (this.redoCheckpoint(sessionId), ok),
      revertToMessage: async ({turnId}) => (this.revertToMessage(sessionId, turnId), ok),
      sendMessage: async ({contentParts}) => (this.startStream(sessionId, contentParts), ok),
      undoCheckpoint: async () => (this.undoCheckpoint(sessionId), ok),
    });
    // One page holds every timeline session; paging is the server's and covered by its tests.
    const sessions: SessionsOwner = {
      view: this.view,
      showProject: async ({depth, projectPath}) => (await this.view.change((draft) => void (draft.projects[projectPath] = this.window(projectPath, depth))), ok),
      hideProject: async ({projectPath}) => (await this.view.change((draft) => void delete draft.projects[projectPath]), ok),
      loadMore: () => value(null),
      openSession: async ({sessionId}) => ((this.openId = sessionId), this.refreshView(), ok),
      closeSession: async () => ((this.openId = null), this.refreshView(), ok),
      create: async (payload) => ({ok: true, value: this.createSession(payload)}),
      fork: async ({sessionId}) => ({ok: true, value: this.record(sessionId)}),
      rename: async ({sessionId, title}) => (this.writeRecord({...this.record(sessionId), title}), ok),
      pin: async ({pinned, sessionId}) => (this.writeRecord({...this.record(sessionId), pinned}), ok),
      archive: ({projectPath, sessionId}) => value({projectPath, sessionId}),
      search: async ({text}) => ({ok: true, value: {sessions: this.matching((session) => session.title.toLowerCase().includes(text.toLowerCase())), nextCursor: null}}),
      listComposerSuggestions: () => value({items: []}),
      listModels: () => value([timelineModelDetails]),
    };
    return {
      sessions,
      status: {statuses: this.statuses},
      holdChat: (sessionId) => {
        const ready = this.sessions.has(sessionId) ? Promise.resolve() : Promise.reject(new Error("Session not found."));
        ready.catch(() => undefined);
        return {service: chat(sessionId), ready, onGone: () => () => undefined, release: () => undefined};
      },
      holdTerminal: () => ({
        service: {
          output: fakeState<TerminalOutput>({output: "", dropped: 0, closed: true}),
          resize: () => value(null),
          write: () => value(null),
        },
        ready: Promise.reject(new Error("Terminals are not available in timeline tests.")),
        onGone: () => () => undefined,
        release: () => undefined,
      }),
      configuration: {get: () => value({modelDefaults: {}})},
      extensions: {update: () => value(null)},
      folders: {
        create: ({path}) => value({path}),
        listFiles: ({query}) => value({items: [], query}),
        listSuggestions: ({query}) => value({homePath: TIMELINE_PROJECT_PATH, query, queryPath: query || TIMELINE_PROJECT_PATH, queryPathType: "directory", suggestions: []}),
      },
      providers: {
        logins: fakeState<ProviderLoginsState>({logins: {}}),
        cancelLogin: async () => ({ok: false, error: {code: "ProviderLoginError", message: "No login."}}),
        list: () => value([]),
        logout: ({providerId}) => value({providerId}),
        startLogin: async () => ({ok: false, error: {code: "ProviderLoginError", message: "No login."}}),
        submitLoginInput: async () => ({ok: false, error: {code: "ProviderLoginError", message: "No login."}}),
      },
      workspace: {
        terminals: fakeState<TerminalsState>({terminals: {}}),
        closeTerminal: () => value(null),
        openTerminal: async () => ({ok: false, error: {code: "TerminalError", message: "Terminals are not available in timeline tests."}}),
        getChanges: () => value({uncommitted: []}),
        getDiffContents: () => value({newContents: "", oldContents: ""}),
        listBranches: async () => ({ok: false, error: {code: "WorkspaceNotARepositoryError", message: "Not a repository."}}),
        listFiles: () => value({files: []}),
        listRepositories: () => value({repositories: []}),
        readFile: () => value({content: ""}),
      },
      ready: async () => undefined,
      onConnectionChange: () => () => undefined,
      dispose: async () => this.stopPump(),
    };
  }

  /** The state of a session, created from its current value on first use. */
  private document(sessionId: string): FakeState<Session> {
    let document = this.documents.get(sessionId);
    if (!document) {
      document = fakeState(this.session(sessionId));
      this.documents.set(sessionId, document);
    }
    return document;
  }

  private record(sessionId: string): ListedSession {
    const record = this.records.get(sessionId);
    if (!record) throw new Error(`Unknown timeline test session: ${sessionId}`);
    return record;
  }

  private writeRecord(record: ListedSession): void {
    this.records.set(record.id, record);
    this.refreshView();
  }

  private refreshView(): void {
    void this.view.change((draft) => {
      for (const [projectPath, window] of Object.entries(draft.projects)) draft.projects[projectPath] = this.window(projectPath, window.depth);
      draft.open = (this.openId === null ? null : (this.records.get(this.openId) ?? null)) as typeof draft.open;
    });
  }

  /** Returns the current session snapshot for a valid test session. */
  private session(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown timeline test session: ${sessionId}`);
    return session;
  }

  /** Mirrors the server: the client's id names the session, and a first message starts its turn. */
  private createSession({id, message, projectPath}: CreateSessionPayload): Session {
    const updatedAt = new Date().toISOString();
    this.writeRecord({id, title: "Untitled session", forked: false, pinned: false, projectPath, updatedAt});
    const session: Session = {
      id,
      updatedAt,
      entries: page([]),
      undone: page([]),
      agent: {},
      live: {},
      usage: {models: {}, tools: {}},
      context: {usedTokens: 0, contextWindow: 0},
    };
    this.sessions.set(session.id, session);
    if (message) this.startStream(session.id, message.contentParts);
    return this.session(session.id);
  }

  /** Replaces a session and publishes it to its state, its status and the listings, as the server does. */
  private commit(session: Session, activity: SessionActivity): void {
    this.sessions.set(session.id, session);
    void this.document(session.id).replace(session);
    void this.statuses.change((draft) => {
      if (activity === "idle") delete draft.sessions[session.id];
      else draft.sessions[session.id] = {activity, notices: [], setupStep: null};
    });
    this.refreshView();
  }

  private matching(include: (record: ListedSession) => boolean): ListedSession[] {
    // A session's activity is its conversation's, as the catalog's `touch` keeps it.
    return [...this.records.values()]
      .filter(include)
      .map((record) => ({...record, updatedAt: this.sessions.get(record.id)?.updatedAt ?? record.updatedAt}))
      .toSorted((left, right) => Number(right.pinned) - Number(left.pinned) || right.updatedAt.localeCompare(left.updatedAt));
  }

  private window(projectPath: string, depth: number) {
    return {depth, loading: false, items: this.matching((session) => session.projectPath === projectPath), hasMore: false};
  }

  /** Index into `entries` of each turn's user entry. */
  private turnStarts(entries: Session["entries"]["items"]): number[] {
    return entries.flatMap((entry, index) => (entry.contentParts === undefined ? [] : [index]));
  }

  /** Shows the first `count` turns of the visible and undone entries together, as checkpoint navigation does. */
  private showTurns(sessionId: string, count: number): void {
    const session = this.session(sessionId);
    const all = [...session.entries.items, ...session.undone.items];
    const starts = this.turnStarts(all);
    const cut = starts[count] ?? all.length;
    this.commit(
      {
        ...session,
        entries: page(all.slice(0, cut)),
        undone: page(all.slice(cut), cut < all.length ? (all[cut - 1]?.id ?? null) : null),
        updatedAt: new Date().toISOString(),
      },
      "idle"
    );
  }

  private visibleTurnCount(session: Session): number {
    return this.turnStarts(session.entries.items).length;
  }

  private undoCheckpoint(sessionId: string): void {
    const count = this.visibleTurnCount(this.session(sessionId));
    if (count > 0) this.showTurns(sessionId, count - 1);
  }

  private redoCheckpoint(sessionId: string): void {
    const session = this.session(sessionId);
    if (this.turnStarts(session.undone.items).length > 0) this.showTurns(sessionId, this.visibleTurnCount(session) + 1);
  }

  private revertToMessage(sessionId: string, turnId: string): void {
    const session = this.session(sessionId);
    const ids = [...session.entries.items, ...session.undone.items].filter((entry) => entry.contentParts !== undefined).map((entry) => String(entry.id));
    const index = ids.indexOf(turnId);
    if (index < 0) return;
    const visible = this.visibleTurnCount(session);
    this.showTurns(sessionId, index < visible ? index : index + 1);
  }

  /** Starts a stream with one line, then waits for tests to request deterministic high-speed bursts. */
  private startStream(sessionId: string, contentParts: readonly UserMessageContentPart[]): void {
    if (this.status === "streaming") return;

    this.activeSessionId = sessionId;
    this.lineCount = 0;
    this.reasoningBreaks = [];
    this.streamTargetLineCount = 0;
    this.status = "streaming";
    // A send drops the undone path, as on the server.
    const session = this.session(sessionId);
    const userId = this.nextEntryId(session);
    this.commit(
      {
        ...session,
        entries: page([...session.entries.items, ...transcript([userEntry({parts: contentParts})], {firstId: userId})]),
        undone: page([]),
        runStart: userId,
        live: this.streamLive(),
      },
      "running"
    );
  }

  private nextEntryId(session: Session): number {
    return Math.max(0, ...[...session.entries.items, ...session.undone.items].map((entry) => entry.id)) + 1;
  }

  /** Interrupts the response at the current line so later lines stream into a new assistant event after a reasoning step. */
  private breakForReasoning(): void {
    if (this.status !== "streaming" || this.reasoningBreaks.includes(this.lineCount)) return;

    this.reasoningBreaks.push(this.lineCount);
  }

  /** `pi.live` with the run and its streaming partial. */
  private streamLive(): LiveState {
    return runningLive({partial: timelineStreamContent({lineCount: this.lineCount, reasoningBreaks: this.reasoningBreaks})});
  }

  /** Adds a finite burst at two complete lines per frame, keeping user gestures deterministic between bursts. */
  private emitLines(additionalLineCount: number): void {
    if (this.status !== "streaming" || additionalLineCount <= 0) return;

    this.streamTargetLineCount += additionalLineCount;
    if (this.streamFrame !== null) return;

    const tick = (): void => {
      if (this.status !== "streaming") return;

      this.lineCount = Math.min(this.lineCount + STREAM_LINES_PER_FRAME, this.streamTargetLineCount);
      this.commit({...this.session(this.activeSessionId), live: this.streamLive()}, "running");

      if (this.lineCount < this.streamTargetLineCount) {
        this.streamFrame = window.requestAnimationFrame(tick);
        return;
      }

      this.streamFrame = null;
    };

    this.streamFrame = window.requestAnimationFrame(tick);
  }

  private stopPump(): void {
    if (this.streamFrame !== null) window.cancelAnimationFrame(this.streamFrame);
    this.streamFrame = null;
    this.streamTargetLineCount = this.lineCount;
  }

  /** Commits the answer as an entry and ends the run in one change, as the engine does. */
  private settleStream(status: "aborted" | "completed"): void {
    if (this.status !== "streaming") return;

    this.stopPump();
    this.status = status;
    const previous = this.session(this.activeSessionId);
    const answer = assistantEntry(timelineStreamContent({lineCount: Math.max(this.lineCount, 1), reasoningBreaks: this.reasoningBreaks}));
    const next = {
      ...previous,
      entries: page([...previous.entries.items, ...transcript([answer], {firstId: this.nextEntryId(previous)})]),
      live: {},
      updatedAt: new Date().toISOString(),
    };
    delete next.runStart;
    this.commit(next, "idle");
  }
}

let sharedServer: TimelineServer | null = null;

/** The isolated in-browser timeline server used by Playwright. */
export function timelineServer(): TimelineServer {
  sharedServer ??= new TimelineServer();
  return sharedServer;
}

/** The app's runtime client over the in-browser timeline server. */
export async function getRuntimeClient(): Promise<RuntimeClient> {
  return timelineServer().client();
}
