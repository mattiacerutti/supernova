import type {ModelDetails, ModelReference, Session, SessionSummary, Turn, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";

export const TIMELINE_PROJECT_PATH = "/tmp/supernova-timeline-e2e";
export const TIMELINE_PROJECT_NAME = "supernova-timeline-e2e";
export const TIMELINE_SESSION_ID = "timeline-session";
export const TIMELINE_SESSION_TITLE = "Timeline stress session";
export const OTHER_SESSION_ID = "other-session";
export const OTHER_SESSION_TITLE = "Second long session";
export const EMPTY_SESSION_ID = "empty-session";
export const EMPTY_SESSION_TITLE = "Empty session";

export const timelineModel = {
  id: "timeline-model",
  providerId: "timeline-provider",
  thinkingLevel: "high",
} satisfies ModelReference;

export const timelineModelDetails = {
  capabilities: {images: false, reasoning: true},
  id: timelineModel.id,
  name: "Timeline Test Model",
  providerId: timelineModel.providerId,
  providerName: "Timeline Test Provider",
  thinkingLevels: [{label: "High", value: "high"}],
} satisfies ModelDetails;

function timestamp(offsetMs: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, 0, offsetMs)).toISOString();
}

function historyTurn(sessionId: string, index: number): Turn {
  return {
    completedAt: timestamp(index * 1_000 + 500),
    events: [
      {
        content: `Assistant history ${index}. ${"This deliberately makes the uncached transcript tall. ".repeat(6)}`,
        id: `${sessionId}-assistant-${index}`,
        timestamp: timestamp(index * 1_000 + 200),
        type: "assistant",
      },
    ],
    id: `${sessionId}-turn-${index}`,
    modelReference: timelineModel,
    startedAt: timestamp(index * 1_000),
    status: "completed",
    userMessage: {
      contentParts: [{text: `User history ${index}. ${"Long prompt content. ".repeat(5)}`, type: "text"}],
      id: `${sessionId}-user-${index}`,
      timestamp: timestamp(index * 1_000),
    },
  };
}

function historySession(input: {readonly historyTurnCount: number; readonly id: string; readonly title: string}): Session {
  const turns = Array.from({length: input.historyTurnCount}, (_, index) => historyTurn(input.id, index));

  return {
    context: {contextWindow: 200_000, usedTokens: 20_000},
    id: input.id,
    modelReference: timelineModel,
    projectPath: TIMELINE_PROJECT_PATH,
    title: input.title,
    turns,
    undoneTurns: [],
    updatedAt: timestamp(turns.length * 1_000),
  };
}

/** Creates the sessions used by every isolated browser test. */
export function createTimelineSessions(): Map<string, Session> {
  const sessions = [
    historySession({historyTurnCount: 28, id: TIMELINE_SESSION_ID, title: TIMELINE_SESSION_TITLE}),
    historySession({historyTurnCount: 24, id: OTHER_SESSION_ID, title: OTHER_SESSION_TITLE}),
    historySession({historyTurnCount: 0, id: EMPTY_SESSION_ID, title: EMPTY_SESSION_TITLE}),
  ];

  return new Map(sessions.map((session) => [session.id, session]));
}

/** Builds a summary for the real project-session list UI. */
export function timelineSessionSummary(session: Session): SessionSummary {
  return {id: session.id, title: session.title, updatedAt: session.updatedAt};
}

/** Formats a unique full-height line emitted by the stress stream. */
export function timelineStreamLine(index: number): string {
  return `Stress stream line ${String(index).padStart(6, "0")} fills the viewport immediately.`;
}

/** Builds one realistic turn whose assistant response grows by complete lines. */
export function timelineStreamTurn(input: {
  readonly contentParts: readonly UserMessageContentPart[];
  readonly lineCount: number;
  readonly status: "completed" | "streaming";
}): Turn {
  const lines = Array.from({length: input.lineCount}, (_, index) => timelineStreamLine(index + 1));
  const completedAt = input.status === "completed" ? timestamp(100_000 + input.lineCount) : undefined;
  const content = input.lineCount > 0 ? ["Extreme-speed streamed response:", ...lines].join("\n") : "";

  return {
    completedAt,
    events: [
      {
        content,
        id: "timeline-stream-assistant",
        timestamp: timestamp(90_000),
        type: "assistant",
      },
    ],
    id: "timeline-stream-turn",
    modelReference: timelineModel,
    startedAt: timestamp(80_000),
    status: input.status,
    userMessage: {contentParts: input.contentParts, id: "timeline-stream-user", timestamp: timestamp(80_000)},
  };
}
