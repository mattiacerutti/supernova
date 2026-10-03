import type {MutableReplicatedState} from "@earendil-works/chord";
import {replicatedState} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {SessionActivity} from "@supernova/contracts/services/session-runtime/procedures";
import type {CreateSessionPayload} from "@supernova/contracts/services/sessions/procedures";
import type {LiveState, Session, UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";
import type {ProviderLoginsState} from "@supernova/contracts/services/providers/services";
import type {ServiceResult} from "@supernova/contracts/lib/protocol";
import type {SessionRuntimeService} from "@supernova/contracts/services/session-runtime/services";
import type {SessionDirectoryState, SessionsService} from "@supernova/contracts/services/sessions/services";
import type {TerminalsState} from "@supernova/contracts/services/workspace/services";
import type {AttachedSession, RuntimeClient} from "@/rpc/transport/runtime-client";
import {
  assistantEntry,
  createTimelineSessions,
  timelineModelDetails,
  timelineSessionSummary,
  timelineStreamMessage,
  userEntry,
  TIMELINE_PROJECT_PATH,
  TIMELINE_SESSION_ID,
} from "@e2e/mocks/timeline-data";
import type {TimelineMockState} from "@e2e/support/timeline-test-api";

export type {AttachedSession, RuntimeClient} from "@/rpc/transport/runtime-client";

const STREAM_LINES_PER_FRAME = 2;
const CREATE_SESSION_FAILURE_DELAY_MS = 150;
const ok = {ok: true, value: null} as const;

/** Resolves to a successful service result. */
const value = async <T>(result: T): Promise<ServiceResult<T>> => ({ok: true, value: result});

/**
 * The server side of the timeline tests, in the browser: sessions as Chord replicated state, read through the same
 * runtime client interface the app uses with the real server.
 */
class TimelineServer {
  private readonly sessions = createTimelineSessions();
  private readonly documents = new Map<string, MutableReplicatedState<Session>>();
  private readonly directory = replicatedState<SessionDirectoryState>({sessions: {}});
  private activeSessionId = TIMELINE_SESSION_ID;
  private createSessionFailure: string | null = null;
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
      failNextCreateSession: (message) => {
        this.createSessionFailure = message;
      },
      getState: () => {
        const session = this.session(TIMELINE_SESSION_ID);
        const count = (entries: Session["entries"]) => entries.filter((entry) => session.turns[String(entry.id)] !== undefined).length;
        return {lineCount: this.lineCount, status: this.status, turnCount: count(session.entries), undoneTurnCount: count(session.undone)};
      },
    };
  }

  /** The runtime client the app uses, over this server's state. */
  public client(): RuntimeClient {
    const sessionRuntime = (sessionId: string): SessionRuntimeService => ({
      session: this.document(sessionId),
      abort: async () => (this.settleStream("aborted"), ok),
      compact: async () => ok,
      redoCheckpoint: async () => (this.redoCheckpoint(sessionId), ok),
      revertToMessage: async ({turnId}) => (this.revertToMessage(sessionId, turnId), ok),
      sendMessage: async ({contentParts}) => (this.startStream(sessionId, contentParts), ok),
      undoCheckpoint: async () => (this.undoCheckpoint(sessionId), ok),
    });
    const sessions: SessionsService = {
      directory: this.directory,
      attach: async () => ok,
      create: async (payload) => {
        const failure = this.createSessionFailure;
        this.createSessionFailure = null;
        if (failure === null) return {ok: true, value: this.createSession(payload)};
        // A real failure arrives after a round trip, while the composer is already docking.
        await new Promise((resolve) => setTimeout(resolve, CREATE_SESSION_FAILURE_DELAY_MS));
        return {ok: false, error: {code: "CreateSessionError", message: failure}};
      },
      detach: async () => ok,
      fork: async ({sessionId}) => ({ok: true, value: this.session(sessionId)}),
      get: async ({sessionId}) => ({ok: true, value: this.session(sessionId)}),
      listComposerSuggestions: () => value({items: []}),
      listModels: () => value([timelineModelDetails]),
      rename: async ({sessionId}) => ({ok: true, value: this.session(sessionId)}),
    };
    return {
      sessions,
      attach: async (sessionId): Promise<AttachedSession> => ({sessionId, sessionRuntime: sessionRuntime(sessionId)}),
      configuration: {get: () => value({modelDefaults: {}})},
      extensions: {update: () => value(null)},
      folders: {
        create: ({path}) => value({path}),
        listFiles: ({query}) => value({items: [], query}),
        listSuggestions: ({query}) => value({homePath: TIMELINE_PROJECT_PATH, query, queryPath: query || TIMELINE_PROJECT_PATH, queryPathType: "directory", suggestions: []}),
      },
      projects: {
        archiveSession: ({projectPath, sessionId}) => value({projectPath, sessionId}),
        listSessions: () => value({projectPath: TIMELINE_PROJECT_PATH, sessions: [...this.sessions.values()].map(timelineSessionSummary)}),
      },
      providers: {
        logins: replicatedState<ProviderLoginsState>({logins: {}}),
        cancelLogin: async () => ({ok: false, error: {code: "ProviderLoginError", message: "No login."}}),
        list: () => value([]),
        logout: ({providerId}) => value({providerId}),
        startLogin: async () => ({ok: false, error: {code: "ProviderLoginError", message: "No login."}}),
        submitLoginInput: async () => ({ok: false, error: {code: "ProviderLoginError", message: "No login."}}),
      },
      workspace: {
        terminals: replicatedState<TerminalsState>({terminals: {}}),
        closeTerminal: () => value(null),
        listTerminals: () => value({terminals: []}),
        openTerminal: async () => ({ok: false, error: {code: "TerminalError", message: "Terminals are not available in timeline tests."}}),
        resizeTerminal: () => value(null),
        writeTerminal: () => value(null),
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

  /** The replicated state of a session, created from its current value on first use. */
  private document(sessionId: string): MutableReplicatedState<Session> {
    let document = this.documents.get(sessionId);
    if (!document) {
      document = replicatedState(this.session(sessionId));
      this.documents.set(sessionId, document);
    }
    return document;
  }

  /** Returns the current session snapshot for a valid test session. */
  private session(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown timeline test session: ${sessionId}`);
    return session;
  }

  /** Mirrors the server: the client's id names the session, and a first message starts its turn. */
  private createSession({id, message, projectPath}: CreateSessionPayload): Session {
    const session: Session = {
      id,
      title: "Untitled session",
      forked: false,
      projectPath,
      updatedAt: new Date().toISOString(),
      entries: [],
      undone: [],
      agent: {},
      live: {},
      usage: {models: {}, tools: {}},
      turns: {},
      context: {usedTokens: 0, contextWindow: 0},
    };
    this.sessions.set(session.id, session);
    if (message) this.startStream(session.id, message.contentParts);
    return this.session(session.id);
  }

  /** Replaces a session and publishes it to its replicated state and the directory, as the server does. */
  private commit(session: Session, activity: SessionActivity): void {
    this.sessions.set(session.id, session);
    this.document(session.id).replace(BACKGROUND_CONTEXT, session);
    this.directory.change(BACKGROUND_CONTEXT, (draft) => {
      draft.sessions[session.id] = {activity, error: null, projectPath: session.projectPath, setupStep: null, summary: timelineSessionSummary(session)};
    });
  }

  /** Index into `entries` of each turn's user entry. */
  private turnStarts(session: Session, entries: Session["entries"]): number[] {
    return entries.flatMap((entry, index) => (session.turns[String(entry.id)] ? [index] : []));
  }

  /** Shows the first `count` turns of the visible and undone entries together, as checkpoint navigation does. */
  private showTurns(sessionId: string, count: number): void {
    const session = this.session(sessionId);
    const all = [...session.entries, ...session.undone];
    const starts = this.turnStarts(session, all);
    const cut = starts[count] ?? all.length;
    this.commit({...session, entries: all.slice(0, cut), undone: all.slice(cut), updatedAt: new Date().toISOString()}, "idle");
  }

  private visibleTurnCount(session: Session): number {
    return this.turnStarts(session, session.entries).length;
  }

  private undoCheckpoint(sessionId: string): void {
    const count = this.visibleTurnCount(this.session(sessionId));
    if (count > 0) this.showTurns(sessionId, count - 1);
  }

  private redoCheckpoint(sessionId: string): void {
    const session = this.session(sessionId);
    if (this.turnStarts(session, session.undone).length > 0) this.showTurns(sessionId, this.visibleTurnCount(session) + 1);
  }

  private revertToMessage(sessionId: string, turnId: string): void {
    const session = this.session(sessionId);
    const ids = [...session.entries, ...session.undone].filter((entry) => session.turns[String(entry.id)]).map((entry) => String(entry.id));
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
    const text = contentParts.map((part) => (part.type === "text" ? part.text : "")).join("");
    this.commit(
      {
        ...session,
        entries: [...session.entries, userEntry(userId, text, 80_000)],
        undone: [],
        runStart: userId,
        turns: {...session.turns, [String(userId)]: {contentParts: [...contentParts]}},
        live: this.streamLive(),
      },
      "running"
    );
  }

  private nextEntryId(session: Session): number {
    return Math.max(0, ...[...session.entries, ...session.undone].map((entry) => entry.id)) + 1;
  }

  /** Interrupts the response at the current line so later lines stream into a new assistant event after a reasoning step. */
  private breakForReasoning(): void {
    if (this.status !== "streaming" || this.reasoningBreaks.includes(this.lineCount)) return;

    this.reasoningBreaks.push(this.lineCount);
  }

  /** `pi.live` with the run and its streaming partial. */
  private streamLive(): LiveState {
    return {
      generation: {attempt: 0, message: timelineStreamMessage({lineCount: this.lineCount, reasoningBreaks: this.reasoningBreaks})},
      run: {inputs: [1], taskId: 1},
    } as unknown as LiveState;
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
    const answer = timelineStreamMessage({lineCount: Math.max(this.lineCount, 1), reasoningBreaks: this.reasoningBreaks});
    const next = {...previous, entries: [...previous.entries, assistantEntry(this.nextEntryId(previous), answer)], live: {}, updatedAt: new Date().toISOString()};
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
