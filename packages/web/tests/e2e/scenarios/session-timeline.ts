import type {ModelDetails, ModelReference, Session, Turn, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";

interface SessionTimelineStreamScenario {
  readonly intervalMs: number;
  readonly lineCount: number;
  readonly responsePrefix: string;
}

interface SessionTimelineCheckpointScenario {
  readonly snapshotDelayMs: number;
}

export interface SessionTimelineScenario {
  readonly checkpoint: SessionTimelineCheckpointScenario;
  readonly historyTurnCount: number;
  readonly kind: "session-timeline";
  readonly projectPath: string;
  readonly sessionId: string;
  readonly stream: SessionTimelineStreamScenario;
  readonly title: string;
}

const defaultSessionTimelineScenario = {
  checkpoint: {snapshotDelayMs: 50},
  historyTurnCount: 24,
  kind: "session-timeline",
  projectPath: "/tmp/supernova-e2e",
  sessionId: "e2e-session",
  stream: {
    intervalMs: 24,
    lineCount: 250,
    responsePrefix: "Assistant streamed response.",
  },
  title: "E2E timeline scroll",
} satisfies SessionTimelineScenario;

export const sessionTimelineModel = {id: "e2e-model", providerId: "e2e-provider", thinkingLevel: "high"} satisfies ModelReference;

export const sessionTimelineModelDetails = {
  capabilities: {images: false, reasoning: true},
  id: sessionTimelineModel.id,
  name: "E2E Model",
  providerId: sessionTimelineModel.providerId,
  providerName: "E2E Provider",
  thinkingLevels: [{label: "High", value: "high"}],
} satisfies ModelDetails;

export class SessionTimelineScenarioBuilder {
  private value: SessionTimelineScenario = defaultSessionTimelineScenario;

  public withCheckpoint(input: Partial<SessionTimelineCheckpointScenario>): this {
    this.value = {...this.value, checkpoint: {...this.value.checkpoint, ...input}};
    return this;
  }

  public withHistoryTurnCount(historyTurnCount: number): this {
    this.value = {...this.value, historyTurnCount};
    return this;
  }

  public withStream(input: Partial<SessionTimelineStreamScenario>): this {
    this.value = {...this.value, stream: {...this.value.stream, ...input}};
    return this;
  }

  public build(): SessionTimelineScenario {
    return {
      ...this.value,
      checkpoint: {...this.value.checkpoint},
      stream: {...this.value.stream},
    };
  }
}

export function sessionTimelineScenario(): SessionTimelineScenarioBuilder {
  return new SessionTimelineScenarioBuilder();
}

export function timestamp(offsetMs: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, 0, offsetMs)).toISOString();
}

export function sessionTimelineBaseSession(input: {readonly scenario: SessionTimelineScenario; readonly turns?: readonly Turn[]}): Session {
  const {scenario, turns = []} = input;

  return {
    id: scenario.sessionId,
    model: sessionTimelineModel,
    projectPath: scenario.projectPath,
    title: scenario.title,
    turns,
    undoneTurns: [],
    updatedAt: timestamp(turns.length * 1_000),
  };
}

export function sessionTimelineHistoryTurn(index: number): Turn {
  return {
    completedAt: timestamp(index * 1_000 + 500),
    events: [
      {content: `Assistant history turn ${index}. ${"history ".repeat(40)}`, id: `assistant-history-${index}`, timestamp: timestamp(index * 1_000 + 200), type: "assistant"},
    ],
    id: `history-turn-${index}`,
    model: sessionTimelineModel,
    startedAt: timestamp(index * 1_000),
    status: "completed",
    userMessage: {
      contentParts: [{text: `User history turn ${index}. ${"prompt ".repeat(20)}`, type: "text"}],
      id: `user-history-${index}`,
      timestamp: timestamp(index * 1_000),
    },
  };
}

export function sessionTimelineStreamContent(input: {readonly lineCount: number; readonly scenario: SessionTimelineScenario}): string {
  const lines = Array.from({length: input.lineCount}, (_, index) => String.fromCharCode(97 + (index % 26)));
  return [input.scenario.stream.responsePrefix, ...lines].join("\n");
}

export function sessionTimelineStreamTurn(input: {
  readonly contentParts: readonly UserMessageContentPart[];
  readonly lineCount: number;
  readonly scenario: SessionTimelineScenario;
  readonly status: "completed" | "error" | "streaming";
}): Turn {
  const completedAt = input.status === "completed" || input.status === "error" ? timestamp(100_000) : undefined;

  return {
    completedAt,
    events: [{content: sessionTimelineStreamContent({lineCount: input.lineCount, scenario: input.scenario}), id: "assistant-stream", timestamp: timestamp(90_000), type: "assistant"}],
    id: "stream-turn",
    model: sessionTimelineModel,
    startedAt: timestamp(80_000),
    status: input.status,
    userMessage: {contentParts: input.contentParts, id: "user-stream", timestamp: timestamp(80_000)},
  };
}

export function projectSummary(session: Session) {
  return {id: session.id, title: session.title, updatedAt: session.updatedAt};
}
