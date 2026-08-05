import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import type {Session, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {Effect, Exit, Fiber, PubSub, Stream} from "effect";
import {type AgentRpcClientApi, type AgentRpcClientFiber, type AgentRpcExecute, type AgentRpcProtocolClient, type AgentRpcRunOptions} from "@/rpc/agent-rpc-client-api";
import {createTimelineSessions, timelineModelDetails, timelineSessionSummary, timelineStreamTurn, TIMELINE_PROJECT_PATH, TIMELINE_SESSION_ID} from "@e2e/mocks/timeline-data";
import type {TimelineMockState} from "@e2e/support/timeline-test-api";

export {AgentRpcProtocolClientService} from "@/rpc/agent-rpc-client-api";
export type {AgentRpcClientApi, AgentRpcClientFiber, AgentRpcProtocolClient} from "@/rpc/agent-rpc-client-api";

const STREAM_LINES_PER_FRAME = 2;

class TimelineRpcClient implements AgentRpcClientApi {
  private readonly events = Effect.runSync(PubSub.unbounded<SessionStreamEvent>());
  private readonly sessions = createTimelineSessions();
  private activeContentParts: readonly UserMessageContentPart[] | null = null;
  private lineCount = 0;
  private publishQueue: Promise<void> = Promise.resolve();
  private revision = 0;
  private status: TimelineMockState["status"] = "idle";
  private streamFrame: number | null = null;
  private streamTargetLineCount = 0;

  public constructor() {
    window.__supernovaTimelineMock = {
      completeStream: () => this.settleStream("completed"),
      emitLines: (lineCount) => this.emitLines(lineCount),
      getState: () => {
        const session = this.session(TIMELINE_SESSION_ID);
        return {lineCount: this.lineCount, status: this.status, turnCount: session.turns.length, undoneTurnCount: session.undoneTurns.length};
      },
    };
  }

  public async dispose(): Promise<void> {
    this.stopPump();
    await this.publishQueue;
    await Effect.runPromise(PubSub.shutdown(this.events));
  }

  public async fork<TSuccess, TError>(execute: AgentRpcExecute<TSuccess, TError>): Promise<AgentRpcClientFiber> {
    const fiber = Effect.runFork(execute(this.protocol()));

    return {
      completed: Effect.runPromise(Fiber.await(fiber)).then(() => undefined),
      interrupt: () => Effect.runPromise(Effect.ignore(Fiber.interrupt(fiber))),
    };
  }

  public async run<TSuccess, TError>(execute: AgentRpcExecute<TSuccess, TError>): Promise<TSuccess> {
    return await Effect.runPromise(execute(this.protocol()));
  }

  public async runExit<TSuccess, TError>(execute: AgentRpcExecute<TSuccess, TError>, options?: AgentRpcRunOptions): Promise<Exit.Exit<TSuccess, TError>> {
    return (await Effect.runPromiseExit(execute(this.protocol()), options)) as Exit.Exit<TSuccess, TError>;
  }

  /** Returns the current session snapshot for a valid test session. */
  private session(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown timeline test session: ${sessionId}`);
    return session;
  }

  /** Exposes the same protocol boundary consumed by the real application. */
  private protocol(): AgentRpcProtocolClient {
    return {
      abortSession: () => Effect.sync(() => this.settleStream("aborted")),
      archiveProjectSession: () => Effect.void,
      cancelProviderLogin: () => Effect.void,
      compactSession: () => Effect.void,
      createFolder: () => Effect.void,
      createSession: () => Effect.succeed(this.session(TIMELINE_SESSION_ID)),
      getFolderStatus: () => Effect.succeed({exists: true, kind: "directory"}),
      getSession: ({sessionId}: {readonly sessionId: string}) => Effect.sync(() => this.session(sessionId)),
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
      logoutProvider: () => Effect.void,
      redoCheckpoint: ({sessionId}: {readonly sessionId: string}) => Effect.sync(() => this.redoCheckpoint(sessionId)),
      renameSession: ({sessionId}: {readonly sessionId: string}) => Effect.sync(() => this.session(sessionId)),
      revertToMessage: ({sessionId, turnId}: {readonly sessionId: string; readonly turnId: string}) => Effect.sync(() => this.revertToMessage(sessionId, turnId)),
      sendMessage: ({contentParts}: {readonly contentParts: readonly UserMessageContentPart[]}) => Effect.sync(() => this.startStream(contentParts)),
      startProviderLogin: () => Effect.succeed({loginSessionId: "timeline-login", status: "completed"}),
      submitProviderLoginInput: () => Effect.void,
      undoCheckpoint: ({sessionId}: {readonly sessionId: string}) => Effect.sync(() => this.undoCheckpoint(sessionId)),
      watchEvents: () => Stream.concat(Stream.succeed({type: "connected"} as const), Stream.fromPubSub(this.events)),
      watchProviderLoginSession: () => Stream.empty,
    } as unknown as AgentRpcProtocolClient;
  }

  /** Serializes publications so revisions arrive in exactly the order generated. */
  private publish(event: SessionStreamEvent): void {
    this.publishQueue = this.publishQueue.then(() => Effect.runPromise(PubSub.publish(this.events, event))).then(() => undefined);
  }

  private nextRevision(): number {
    this.revision += 1;
    return this.revision;
  }

  /** Commits a checkpoint change and publishes its authoritative snapshot. */
  private commitCheckpoint(session: Session): void {
    const updatedSession = {...session, updatedAt: new Date().toISOString()};
    this.sessions.set(session.id, updatedSession);
    this.publish({revision: this.nextRevision(), session: updatedSession, sessionId: session.id, type: "session.snapshot"});
  }

  private undoCheckpoint(sessionId: string): void {
    const session = this.session(sessionId);
    const turn = session.turns.at(-1);
    if (!turn) return;

    this.commitCheckpoint({...session, turns: session.turns.slice(0, -1), undoneTurns: [turn, ...session.undoneTurns]});
  }

  private redoCheckpoint(sessionId: string): void {
    const session = this.session(sessionId);
    const turn = session.undoneTurns[0];
    if (!turn) return;

    this.commitCheckpoint({...session, turns: [...session.turns, turn], undoneTurns: session.undoneTurns.slice(1)});
  }

  private revertToMessage(sessionId: string, turnId: string): void {
    const session = this.session(sessionId);
    const undoneIndex = session.undoneTurns.findIndex((turn) => turn.id === turnId);
    if (undoneIndex >= 0) {
      this.commitCheckpoint({
        ...session,
        turns: [...session.turns, ...session.undoneTurns.slice(0, undoneIndex + 1)],
        undoneTurns: session.undoneTurns.slice(undoneIndex + 1),
      });
      return;
    }

    const turnIndex = session.turns.findIndex((turn) => turn.id === turnId);
    if (turnIndex < 0) return;

    this.commitCheckpoint({...session, turns: session.turns.slice(0, turnIndex), undoneTurns: [...session.turns.slice(turnIndex), ...session.undoneTurns]});
  }

  /** Starts a stream with one line, then waits for tests to request deterministic high-speed bursts. */
  private startStream(contentParts: readonly UserMessageContentPart[]): void {
    if (this.status === "streaming") return;

    this.activeContentParts = contentParts;
    this.lineCount = 1;
    this.streamTargetLineCount = 1;
    this.status = "streaming";
    this.publish({revision: this.nextRevision(), sessionId: TIMELINE_SESSION_ID, type: "session.agent.started"});
    this.publish({
      revision: this.nextRevision(),
      sessionId: TIMELINE_SESSION_ID,
      context: this.session(TIMELINE_SESSION_ID).context,
      turn: timelineStreamTurn({contentParts, lineCount: this.lineCount, status: "streaming"}),
      type: "session.turn",
    });
  }

  /** Adds a finite burst at two complete lines per frame, keeping user gestures deterministic between bursts. */
  private emitLines(additionalLineCount: number): void {
    if (this.status !== "streaming" || additionalLineCount <= 0) return;

    this.streamTargetLineCount += additionalLineCount;
    if (this.streamFrame !== null) return;

    const tick = (): void => {
      if (this.status !== "streaming") return;

      this.lineCount = Math.min(this.lineCount + STREAM_LINES_PER_FRAME, this.streamTargetLineCount);
      const contentParts = this.activeContentParts ?? [{text: "Timeline test prompt", type: "text"}];
      this.publish({
        revision: this.nextRevision(),
        sessionId: TIMELINE_SESSION_ID,
        context: this.session(TIMELINE_SESSION_ID).context,
        turn: timelineStreamTurn({contentParts, lineCount: this.lineCount, status: "streaming"}),
        type: "session.turn",
      });

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

  /** Commits the current turn using production event ordering after completion or an abort. */
  private settleStream(status: "aborted" | "completed"): void {
    if (this.status !== "streaming") return;

    this.stopPump();
    this.status = status;
    const contentParts = this.activeContentParts ?? [{text: "Timeline test prompt", type: "text"}];
    const completedTurn = timelineStreamTurn({contentParts, lineCount: Math.max(this.lineCount, 1), status: "completed"});
    const previous = this.session(TIMELINE_SESSION_ID);
    const session = {...previous, turns: [...previous.turns, completedTurn], updatedAt: new Date().toISOString()};
    this.sessions.set(session.id, session);
    this.activeContentParts = null;

    this.publish({revision: this.nextRevision(), sessionId: session.id, type: "session.agent.ended"});
    this.publish({revision: this.nextRevision(), session, sessionId: session.id, type: "session.snapshot"});
  }
}

let sharedClient: TimelineRpcClient | null = null;

/** Initializes the isolated in-browser timeline RPC mock used by Playwright. */
export async function getAgentRpcClient(): Promise<AgentRpcClientApi> {
  sharedClient ??= new TimelineRpcClient();
  return sharedClient;
}
