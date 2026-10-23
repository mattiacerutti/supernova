import type {ModelDetails, ModelReference, Session, SessionSummary, TextContent, ThinkingContent} from "@supernova/contracts/services/sessions/schemas";
import type {EntryDraft} from "@tests/support/session";
import {assistantEntry, sessionDocument, transcript, userEntry} from "@tests/support/session";

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

function historySession(input: {readonly historyTurnCount: number; readonly id: string; readonly title: string}): Session {
  const drafts: EntryDraft[] = Array.from({length: input.historyTurnCount}, (_, index) => [
    userEntry(`User history ${index}. ${"Long prompt content. ".repeat(5)}`),
    assistantEntry(`Assistant history ${index}. ${"This deliberately makes the uncached transcript tall. ".repeat(6)}`),
  ]).flat();

  return sessionDocument({
    id: input.id,
    title: input.title,
    projectPath: TIMELINE_PROJECT_PATH,
    updatedAt: timestamp(input.historyTurnCount * 1_000),
    entries: transcript(drafts),
    agent: {model: {modelId: timelineModel.id, provider: timelineModel.providerId}, thinkingLevel: "high"},
    context: {contextWindow: 200_000, usedTokens: 20_000},
  });
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
  return {forked: false, id: session.id, pinned: session.pinned, title: session.title, updatedAt: session.updatedAt};
}

/** Formats a unique full-height line emitted by the stress stream. */
export function timelineStreamLine(index: number): string {
  return `Stress stream line ${String(index).padStart(6, "0")} fills the viewport immediately.`;
}

/**
 * Builds the assistant answer of the stress stream, growing by complete lines. Each reasoning break is a line count
 * after which a reasoning step interrupts the response, so later lines flow into a fresh text part.
 */
export function timelineStreamContent(input: {readonly lineCount: number; readonly reasoningBreaks?: readonly number[]}): (TextContent | ThinkingContent)[] {
  const {lineCount, reasoningBreaks = []} = input;
  const segmentStarts = [0, ...reasoningBreaks.filter((lineIndex) => lineIndex > 0 && lineIndex < lineCount)];
  const content: (TextContent | ThinkingContent)[] = [];

  segmentStarts.forEach((segmentStart, segmentIndex) => {
    const segmentEnd = segmentStarts[segmentIndex + 1] ?? lineCount;
    const lines = Array.from({length: segmentEnd - segmentStart}, (_, index) => timelineStreamLine(segmentStart + index + 1));
    if (reasoningBreaks.includes(segmentStart)) content.push({thinking: `Reasoning step ${segmentIndex} before continuing.`, type: "thinking"});
    content.push({text: lines.length > 0 ? ["Extreme-speed streamed response:", ...lines].join("\n") : "", type: "text"});
  });

  return content;
}
