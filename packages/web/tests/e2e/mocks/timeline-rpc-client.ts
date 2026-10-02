import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import type {CreateSessionPayload} from "@supernova/contracts/sessions/procedures";
import {CreateSessionError} from "@supernova/contracts/sessions/procedures";
import type {JsonValue} from "@earendil-works/chord";
import {diffRevisions} from "@earendil-works/chord/delta";
import type {SessionActivity} from "@supernova/contracts/session-runtime/procedures";
import type {LiveState, Session, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {Effect, Exit, Fiber, PubSub, Stream} from "effect";
import type {RpcClient, RpcClientFiber, RpcExecute, RpcProtocolClient, RpcRunOptions} from "@/rpc/transport/protocol";
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

export {RpcProtocolClientService} from "@/rpc/transport/protocol";
export type {RpcClient, RpcClientFiber, RpcProtocolClient} from "@/rpc/transport/protocol";

const STREAM_LINES_PER_FRAME = 2;
const CREATE_SESSION_FAILURE_DELAY = "150 millis";

class TimelineRpcClient implements RpcClient {
  private readonly events = Effect.runSync(PubSub.unbounded<SessionStreamEvent>());
  private readonly sessions = createTimelineSessions();
  private activeSessionId = TIMELINE_SESSION_ID;
  private createSessionFailure: string | null = null;
  private lineCount = 0;
  private publishQueue: Promise<void> = Promise.resolve();
  private reasoningBreaks: number[] = [];
  private revision = 0;
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

  public async dispose(): Promise<void> {
    this.stopPump();
    await this.publishQueue;
    await Effect.runPromise(PubSub.shutdown(this.events));
  }

  public async fork<TSuccess, TError>(execute: RpcExecute<TSuccess, TError>): Promise<RpcClientFiber> {
    const fiber = Effect.runFork(execute(this.protocol()));

    return {
      completed: Effect.runPromise(Fiber.await(fiber)).then(() => undefined),
      interrupt: () => Effect.runPromise(Effect.ignore(Fiber.interrupt(fiber))),
    };
  }

  public async run<TSuccess, TError>(execute: RpcExecute<TSuccess, TError>): Promise<TSuccess> {
    return await Effect.runPromise(execute(this.protocol()));
  }

  public async runExit<TSuccess, TError>(execute: RpcExecute<TSuccess, TError>, options?: RpcRunOptions): Promise<Exit.Exit<TSuccess, TError>> {
    return (await Effect.runPromiseExit(execute(this.protocol()), options)) as Exit.Exit<TSuccess, TError>;
  }

  /** Returns the current session snapshot for a valid test session. */
  private session(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown timeline test session: ${sessionId}`);
    return session;
  }

  /** Exposes the same protocol boundary consumed by the real application. */
  private protocol(): RpcProtocolClient {
    return {
      abortSession: () => Effect.sync(() => this.settleStream("aborted")),
      archiveProjectSession: () => Effect.void,
      cancelProviderLogin: () => Effect.void,
      compactSession: () => Effect.void,
      createFolder: () => Effect.void,
      createSession: (payload: CreateSessionPayload) =>
        Effect.suspend(() => {
          const failure = this.createSessionFailure;
          this.createSessionFailure = null;
          if (failure === null) return Effect.sync(() => this.createSession(payload));
          // A real failure arrives after a round trip, while the composer is already docking.
          return Effect.delay(Effect.fail(new CreateSessionError({message: failure})), CREATE_SESSION_FAILURE_DELAY);
        }),
      getFolderStatus: () => Effect.succeed({exists: true, kind: "directory"}),
      getSession: ({sessionId}: {readonly sessionId: string}) => Effect.sync(() => this.session(sessionId)),
      getWorkspaceChanges: () => Effect.succeed({uncommitted: []}),
      getWorkspaceDiffContents: () => Effect.succeed({newContents: "", oldContents: ""}),
      listComposerSuggestions: () => Effect.succeed({items: []}),
      listFolderFiles: () => Effect.succeed({items: []}),
      listFolderSuggestions: ({query}: {readonly query: string}) =>
        Effect.succeed({
          homePath: TIMELINE_PROJECT_PATH,
          query,
          queryPath: query || TIMELINE_PROJECT_PATH,
          queryPathType: "directory",
          suggestions: [],
        }),
      listModels: () => Effect.succeed([timelineModelDetails]),
      listProjectSessions: () =>
        Effect.succeed({
          projectPath: TIMELINE_PROJECT_PATH,
          sessions: [...this.sessions.values()].map(timelineSessionSummary),
        }),
      listProviders: () => Effect.succeed([]),
      listWorkspaceFiles: () => Effect.succeed({files: []}),
      listWorkspaceRepositories: () => Effect.succeed({repositories: []}),
      logoutProvider: () => Effect.void,
      readWorkspaceFile: () => Effect.succeed({content: ""}),
      redoCheckpoint: ({sessionId}: {readonly sessionId: string}) => Effect.sync(() => this.redoCheckpoint(sessionId)),
      renameSession: ({sessionId}: {readonly sessionId: string}) => Effect.sync(() => this.session(sessionId)),
      revertToMessage: ({sessionId, turnId}: {readonly sessionId: string; readonly turnId: string}) => Effect.sync(() => this.revertToMessage(sessionId, turnId)),
      sendMessage: ({contentParts, sessionId}: {readonly contentParts: readonly UserMessageContentPart[]; readonly sessionId: string}) =>
        Effect.sync(() => this.startStream(sessionId, contentParts)),
      startProviderLogin: () => Effect.succeed({loginSessionId: "timeline-login", status: "completed"}),
      submitProviderLoginInput: () => Effect.void,
      undoCheckpoint: ({sessionId}: {readonly sessionId: string}) => Effect.sync(() => this.undoCheckpoint(sessionId)),
      watchEvents: () => Stream.concat(Stream.succeed({type: "connected"} as const), Stream.fromPubSub(this.events)),
      watchProviderLoginSession: () => Stream.empty,
    } as unknown as RpcProtocolClient;
  }

  /** Mirrors the server: the client's id names the session, and a first message starts its turn. */
  private createSession({id, message, projectPath}: CreateSessionPayload): Session {
    const session: Session = {
      id,
      version: 1,
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

  /** Serializes publications so revisions arrive in exactly the order generated. */
  private publish(event: SessionStreamEvent): void {
    this.publishQueue = this.publishQueue.then(() => Effect.runPromise(PubSub.publish(this.events, event))).then(() => undefined);
  }

  private nextRevision(): number {
    this.revision += 1;
    return this.revision;
  }

  /** Replaces a session and publishes the change as a Chord delta, as the server does. */
  private commit(next: Omit<Session, "version">, activity: SessionActivity): void {
    const previous = this.session(next.id);
    const version = previous.version + 1;
    const session = {...next, version} as Session;
    this.sessions.set(session.id, session);
    const ops = diffRevisions(previous as unknown as JsonValue, session as unknown as JsonValue);
    this.publish({activity, ops, revision: this.nextRevision(), sessionId: session.id, type: "session.state", version});
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
        turns: {...session.turns, [String(userId)]: {contentParts}},
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

let sharedClient: TimelineRpcClient | null = null;

/** Initializes the isolated in-browser timeline RPC mock used by Playwright. */
export async function getRpcClient(): Promise<RpcClient> {
  sharedClient ??= new TimelineRpcClient();
  return sharedClient;
}
