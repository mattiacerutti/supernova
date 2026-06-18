import type {ModelDetails, ModelReference, Session, Turn, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";

interface SessionTimelineStreamScenario {
  readonly intervalMs: number;
  readonly lineCount: number;
  readonly liveIdPrefix: string;
  readonly responsePrefix: string;
  readonly settledIdPrefix: string;
}

interface SessionTimelineCheckpointScenario {
  readonly snapshotDelayMs: number;
}

interface SessionTimelineCommandToolScenario {
  readonly outputLineCount: number;
}

export interface SessionTimelineScenario {
  readonly checkpoint: SessionTimelineCheckpointScenario;
  readonly commandTool?: SessionTimelineCommandToolScenario;
  readonly historyTurnCount: number;
  readonly kind: "session-timeline";
  readonly projectPath: string;
  readonly sessionId: string;
  readonly stream: SessionTimelineStreamScenario;
  readonly title: string;
}

const defaultSessionTimelineScenario = {
  checkpoint: {snapshotDelayMs: 50},
  commandTool: undefined,
  historyTurnCount: 24,
  kind: "session-timeline",
  projectPath: "/tmp/supernova-e2e",
  sessionId: "e2e-session",
  stream: {
    intervalMs: 24,
    lineCount: 250,
    liveIdPrefix: "",
    responsePrefix: "Assistant streamed response.",
    settledIdPrefix: "",
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

  public withCommandTool(input: SessionTimelineCommandToolScenario): this {
    this.value = {...this.value, commandTool: {...input}};
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
      commandTool: this.value.commandTool ? {...this.value.commandTool} : undefined,
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
    context: {usedTokens: 0, contextWindow: 200_000},
    model: sessionTimelineModel,
    projectPath: scenario.projectPath,
    title: scenario.title,
    turns,
    undoneTurns: [],
    updatedAt: timestamp(turns.length * 1_000),
  };
}

export function sessionTimelineCommandToolTurn(input: {readonly index: number; readonly outputLineCount: number}): Turn {
  const {index, outputLineCount} = input;
  const output = Array.from({length: outputLineCount}, (_, lineIndex) => `command output line ${lineIndex}`).join("\n");

  return {
    completedAt: timestamp(index * 1_000 + 500),
    events: [
      {
        id: `command-tool-${index}`,
        timestamp: timestamp(index * 1_000 + 200),
        tool: {
          input: {command: "printf long output"},
          kind: "command",
          result: {output, truncated: false},
          status: "completed",
        },
        type: "tool",
      },
    ],
    id: `command-tool-turn-${index}`,
    model: sessionTimelineModel,
    startedAt: timestamp(index * 1_000),
    status: "completed",
    userMessage: {
      contentParts: [{text: `User command tool turn ${index}.`, type: "text"}],
      id: `user-command-tool-${index}`,
      timestamp: timestamp(index * 1_000),
    },
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
  const idPrefix = input.status === "streaming" ? input.scenario.stream.liveIdPrefix : input.scenario.stream.settledIdPrefix;

  return {
    completedAt,
    events: [
      {content: sessionTimelineStreamContent({lineCount: input.lineCount, scenario: input.scenario}), id: `${idPrefix}assistant-stream`, timestamp: timestamp(90_000), type: "assistant"},
    ],
    id: `${idPrefix}stream-turn`,
    model: sessionTimelineModel,
    startedAt: timestamp(80_000),
    status: input.status,
    userMessage: {contentParts: input.contentParts, id: `${idPrefix}user-stream`, timestamp: timestamp(80_000)},
  };
}

export function projectSummary(session: Session) {
  return {id: session.id, title: session.title, updatedAt: session.updatedAt};
}
