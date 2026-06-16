import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import type {Session, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {Effect, Exit, Fiber, PubSub, Stream} from "effect";
import type {AgentRpcClientApi, AgentRpcClientFiber, AgentRpcProtocolClient} from "@/rpc/agent-rpc-client";
import type {E2eScenario} from "@e2e/scenarios/scenario";
import {
  projectSummary,
  sessionTimelineBaseSession,
  sessionTimelineCommandToolTurn,
  sessionTimelineHistoryTurn,
  sessionTimelineModelDetails,
  sessionTimelineScenario,
  sessionTimelineStreamTurn,
  timestamp,
} from "@e2e/scenarios/session-timeline";
import type {SessionTimelineScenario} from "@e2e/scenarios/session-timeline";

export interface E2eState {
  readonly lineCount: number;
  readonly session: Session;
}

interface E2eController {
  readonly getState: () => E2eState;
}

declare global {
  interface Window {
    __supernovaE2E?: E2eController;
    __supernovaE2EScenario?: E2eScenario;
  }
}

function readE2eScenario(): SessionTimelineScenario {
  const scenario = window.__supernovaE2EScenario ?? sessionTimelineScenario().build();
  if (scenario.kind !== "session-timeline") throw new Error(`Unsupported e2e scenario: ${scenario.kind}`);
  return scenario;
}

/** Test-only full app RPC client used by Playwright when VITE_SUPERNOVA_E2E is enabled. */
export class E2eAgentRpcClient implements AgentRpcClientApi {
  private readonly events = Effect.runSync(PubSub.unbounded<SessionStreamEvent>());
  private readonly historyTurns: readonly ReturnType<typeof sessionTimelineHistoryTurn>[];
  private activeContentParts: readonly UserMessageContentPart[] | null = null;
  private lineCount = 0;
  private revision = 0;
  private session: Session;
  private streamTimer: number | null = null;

  public constructor(private readonly scenario: SessionTimelineScenario) {
    const historyTurns = Array.from({length: scenario.historyTurnCount}, (_, index) => sessionTimelineHistoryTurn(index));
    this.historyTurns = scenario.commandTool
      ? [...historyTurns, sessionTimelineCommandToolTurn({index: scenario.historyTurnCount, outputLineCount: scenario.commandTool.outputLineCount})]
      : historyTurns;
    this.session = sessionTimelineBaseSession({scenario, turns: this.historyTurns});
    window.__supernovaE2E = {
      getState: () => ({lineCount: this.lineCount, session: this.session}),
    };
  }

  public async dispose(): Promise<void> {
    this.cancelStream();
    await Effect.runPromise(PubSub.shutdown(this.events));
  }

  public async fork<TSuccess, TError>(execute: (client: AgentRpcProtocolClient) => Effect.Effect<TSuccess, TError, never>): Promise<AgentRpcClientFiber> {
    const fiber = Effect.runFork(execute(this.protocol()));

    return {
      completed: Effect.runPromise(Fiber.await(fiber)).then(() => undefined),
      interrupt: () => Effect.runPromise(Effect.ignore(Fiber.interrupt(fiber))),
    };
  }

  public async run<TSuccess, TError>(execute: (client: AgentRpcProtocolClient) => Effect.Effect<TSuccess, TError, never>): Promise<TSuccess> {
    return await Effect.runPromise(execute(this.protocol()));
  }

  public async runExit<TSuccess, TError>(execute: (client: AgentRpcProtocolClient) => Effect.Effect<TSuccess, TError, never>): Promise<Exit.Exit<TSuccess, TError>> {
    return (await Effect.runPromiseExit(execute(this.protocol()))) as Exit.Exit<TSuccess, TError>;
  }

  private protocol(): AgentRpcProtocolClient {
    return {
      abortSession: () => Effect.sync(() => this.abortStream()),
      archiveProjectSession: () => Effect.void,
      compactSession: () => Effect.void,
      createFolder: () => Effect.void,
      createSession: () => Effect.succeed(this.session),
      getFolderStatus: () => Effect.succeed({exists: true, kind: "directory"}),
      getSession: () => Effect.succeed(this.session),
      listComposerSuggestions: () => Effect.succeed({items: []}),
      listFolderFiles: () => Effect.succeed({items: []}),
      listFolderSuggestions: () => Effect.succeed({items: []}),
      listModels: () => Effect.succeed([sessionTimelineModelDetails]),
      listProjectSessions: () => Effect.succeed({projectPath: this.scenario.projectPath, sessions: [projectSummary(this.session)]}),
      listProviders: () => Effect.succeed([]),
      logoutProvider: () => Effect.void,
      redoCheckpoint: () => Effect.sync(() => this.redoCheckpoint()),
      renameSession: () => Effect.succeed(this.session),
      revertToMessage: (input: {readonly turnId: string}) => Effect.sync(() => this.revertToMessage(input.turnId)),
      setProviderApiKey: () => Effect.void,
      startProviderOAuthLogin: () => Effect.succeed({loginSessionId: "e2e-login", status: "completed"}),
      submitProviderLoginInput: () => Effect.void,
      cancelProviderLogin: () => Effect.void,
      undoCheckpoint: () => Effect.sync(() => this.undoCheckpoint()),
      watchEvents: () => Stream.fromPubSub(this.events),
      watchProviderLoginSession: () => Stream.empty,
      sendMessage: (input: {readonly contentParts: readonly UserMessageContentPart[]}) => Effect.sync(() => this.startStream(input.contentParts)),
    } as unknown as AgentRpcProtocolClient;
  }

  private publish(event: SessionStreamEvent): void {
    void Effect.runPromise(PubSub.publish(this.events, event));
  }

  private nextRevision(): number {
    this.revision += 1;
    return this.revision;
  }

  private cancelStream(): void {
    if (this.streamTimer !== null) window.clearTimeout(this.streamTimer);
    this.streamTimer = null;
  }

  private startStream(contentParts: readonly UserMessageContentPart[]): void {
    this.cancelStream();
    this.activeContentParts = contentParts;
    this.lineCount = 1;
    this.publish({revision: this.nextRevision(), sessionId: this.scenario.sessionId, type: "session.agent.started"});
    this.publish({revision: this.nextRevision(), sessionId: this.scenario.sessionId, turn: sessionTimelineStreamTurn({contentParts, lineCount: this.lineCount, scenario: this.scenario, status: "streaming"}), type: "session.turn"});

    const tick = (): void => {
      this.lineCount += 1;
      if (this.lineCount > this.scenario.stream.lineCount) {
        this.finishStream(contentParts);
        return;
      }

      this.publish({revision: this.nextRevision(), sessionId: this.scenario.sessionId, turn: sessionTimelineStreamTurn({contentParts, lineCount: this.lineCount, scenario: this.scenario, status: "streaming"}), type: "session.turn"});
      this.streamTimer = window.setTimeout(tick, this.scenario.stream.intervalMs);
    };

    this.streamTimer = window.setTimeout(tick, this.scenario.stream.intervalMs);
  }

  private publishSnapshot(): void {
    this.publish({revision: this.nextRevision(), session: this.session, sessionId: this.scenario.sessionId, type: "session.snapshot"});
  }

  private scheduleCheckpointSnapshot(update: (session: Session) => Session): void {
    window.setTimeout(() => {
      this.session = update(this.session);
      this.publishSnapshot();
    }, this.scenario.checkpoint.snapshotDelayMs);
  }

  private undoCheckpoint(): void {
    this.scheduleCheckpointSnapshot((session) => {
      const turn = session.turns.at(-1);
      if (!turn) return session;

      return {...session, turns: session.turns.slice(0, -1), undoneTurns: [turn, ...session.undoneTurns], updatedAt: timestamp(120_000 + this.revision)};
    });
  }

  private redoCheckpoint(): void {
    this.scheduleCheckpointSnapshot((session) => {
      const turn = session.undoneTurns[0];
      if (!turn) return session;

      return {...session, turns: [...session.turns, turn], undoneTurns: session.undoneTurns.slice(1), updatedAt: timestamp(120_000 + this.revision)};
    });
  }

  private revertToMessage(turnId: string): void {
    this.scheduleCheckpointSnapshot((session) => {
      const undoneIndex = session.undoneTurns.findIndex((turn) => turn.id === turnId);
      if (undoneIndex >= 0) {
        const restoredTurns = session.undoneTurns.slice(0, undoneIndex + 1).reverse();
        return {
          ...session,
          turns: [...session.turns, ...restoredTurns],
          undoneTurns: session.undoneTurns.slice(undoneIndex + 1),
          updatedAt: timestamp(120_000 + this.revision),
        };
      }

      const turnIndex = session.turns.findIndex((turn) => turn.id === turnId);
      if (turnIndex < 0) return session;

      const undoneTurns = session.turns.slice(turnIndex).reverse();
      return {
        ...session,
        turns: session.turns.slice(0, turnIndex),
        undoneTurns: [...undoneTurns, ...session.undoneTurns],
        updatedAt: timestamp(120_000 + this.revision),
      };
    });
  }

  private abortStream(): void {
    const contentParts = this.activeContentParts ?? [{text: "E2E prompt", type: "text"}];
    this.settleStream({contentParts, lineCount: Math.max(this.lineCount, 1), status: "error"});
  }

  private finishStream(contentParts: readonly UserMessageContentPart[] = [{text: "E2E prompt", type: "text"}]): void {
    this.settleStream({contentParts, lineCount: this.scenario.stream.lineCount, status: "completed"});
  }

  private settleStream(input: {readonly contentParts: readonly UserMessageContentPart[]; readonly lineCount: number; readonly status: "completed" | "error"}): void {
    this.cancelStream();
    this.activeContentParts = null;
    const completedTurn = sessionTimelineStreamTurn({...input, scenario: this.scenario});
    this.session = sessionTimelineBaseSession({scenario: this.scenario, turns: [...this.historyTurns, completedTurn]});
    this.publishSnapshot();
    this.publish({revision: this.nextRevision(), sessionId: this.scenario.sessionId, type: "session.agent.ended"});
  }
}

/** Creates the test RPC client for the current browser page. */
export function createE2eAgentRpcClient(): AgentRpcClientApi {
  return new E2eAgentRpcClient(readE2eScenario());
}
