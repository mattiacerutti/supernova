import type {AssistantMessage, EntryRecord, ModelDetails, ModelReference, Session, SessionSummary, SessionEntry, ToolCall} from "@supernova/contracts/services/sessions/schemas";

export const TIMELINE_PROJECT_PATH = "/tmp/supernova-timeline-e2e";
export const TIMELINE_PROJECT_NAME = "supernova-timeline-e2e";
export const TIMELINE_SESSION_ID = "timeline-session";
export const TIMELINE_SESSION_TITLE = "Timeline stress session";
export const OTHER_SESSION_ID = "other-session";
export const OTHER_SESSION_TITLE = "Second long session";
export const EMPTY_SESSION_ID = "empty-session";
export const EMPTY_SESSION_TITLE = "Empty session";
export const WORK_SESSION_ID = "work-session";
export const WORK_SESSION_TITLE = "Recorded tool work";
export const DIFF_SESSION_ID = "diff-session";
export const DIFF_SESSION_TITLE = "Recorded file changes";
export const LARGE_DIFF_SESSION_ID = "large-diff-session";
export const LARGE_DIFF_SESSION_TITLE = "Large recorded file changes";
export const PAGED_SESSION_ID = "paged-session";
export const PAGED_SESSION_TITLE = "Paginated history";

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

const usage = {cacheRead: 0, cacheWrite: 0, cost: {cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0}, input: 0, output: 0, totalTokens: 0};

/** A Pi user entry. */
export function userEntry(id: number, text: string, offsetMs: number): SessionEntry {
  return {
    conversationId: 1,
    id,
    kind: "pi.user",
    model: [{content: text, role: "user", timestamp: Date.parse(timestamp(offsetMs))}],
    contentParts: [{text, type: "text"}],
  } as unknown as SessionEntry;
}

/** A Pi assistant message as the engine stores and streams it. */
export function assistantMessage(content: AssistantMessage["content"], offsetMs: number): AssistantMessage {
  return {
    api: "timeline",
    content,
    model: timelineModel.id,
    provider: timelineModel.providerId,
    role: "assistant",
    stopReason: "stop",
    timestamp: Date.parse(timestamp(offsetMs)),
    usage,
  };
}

/** A Pi assistant entry. */
export function assistantEntry(id: number, message: AssistantMessage): EntryRecord {
  return {conversationId: 1, id, kind: "pi.assistant", model: [message]} as unknown as EntryRecord;
}

function historySession(input: {readonly historyTurnCount: number; readonly id: string; readonly title: string}): Session {
  const entries: SessionEntry[] = [];
  for (let index = 0; index < input.historyTurnCount; index++) {
    const text = `User history ${index}. ${"Long prompt content. ".repeat(5)}`;
    const userId = entries.length + 1;
    entries.push(userEntry(userId, text, index * 1_000));
    const answer = `Assistant history ${index}. ${"This deliberately makes the uncached transcript tall. ".repeat(6)}`;
    entries.push(assistantEntry(entries.length + 1, assistantMessage([{text: answer, type: "text"}], index * 1_000 + 200)));
  }

  return {
    id: input.id,
    title: input.title,
    forked: false,
    pinned: false,
    projectPath: TIMELINE_PROJECT_PATH,
    updatedAt: timestamp(input.historyTurnCount * 1_000),
    entries: {items: entries, remaining: 0},
    undone: {items: [], remaining: 0},
    agent: {model: {modelId: timelineModel.id, provider: timelineModel.providerId}, thinkingLevel: "high"},
    live: {},
    usage: {models: {}, tools: {}},
    context: {contextWindow: 200_000, usedTokens: 20_000},
  };
}

function workHistorySession(): Session {
  const session = historySession({historyTurnCount: 0, id: WORK_SESSION_ID, title: WORK_SESSION_TITLE});
  const calls = Array.from({length: 60}, (_, index) => ({arguments: {command: `echo recorded-work-${index}`}, id: `call-${index}`, name: "bash", type: "toolCall" as const}));
  const results = calls.map((call, index) => ({
    conversationId: 1,
    id: index + 3,
    kind: "pi.tool-result",
    model: [
      {
        content: [{text: index === 1 ? Array.from({length: 100}, (_, line) => `Output line ${line}`).join("\n") : `Recorded output ${index}`, type: "text"}],
        isError: false,
        role: "toolResult",
        timestamp: Date.parse(timestamp(300 + index)),
        toolCallId: call.id,
        toolName: call.name,
      },
    ],
  })) as unknown as EntryRecord[];
  const groups = Array.from({length: 120}, (_, index) => {
    const call = {arguments: {command: `echo group-${index}`}, id: `group-call-${index}`, name: "bash", type: "toolCall" as const};
    return [
      assistantEntry(100 + index * 2, {
        ...assistantMessage([{thinking: `Recorded reasoning ${index}. ${"Variable height reasoning. ".repeat(1 + (index % 5) * 3)}`, type: "thinking"}, call], 2000 + index * 10),
        stopReason: "toolUse",
      }),
      {
        ...results[0],
        id: 101 + index * 2,
        model: [
          {
            content: [{text: `Group output ${index}`, type: "text"}],
            isError: false,
            role: "toolResult",
            timestamp: Date.parse(timestamp(2001 + index * 10)),
            toolCallId: call.id,
            toolName: call.name,
          },
        ],
      } as unknown as EntryRecord,
    ];
  }).flat();
  return {
    ...session,
    entries: {
      items: [
        userEntry(1, "Inspect the recorded work", 0),
        assistantEntry(2, {...assistantMessage([{thinking: "Review the recorded commands.", type: "thinking"}, ...calls], 200), stopReason: "toolUse"}),
        ...results,
        ...groups,
        assistantEntry(400, assistantMessage([{text: "The recorded work is complete.", type: "text"}], 4000)),
      ],
      remaining: 0,
    },
  };
}

function diffHistorySession(large = false): Session {
  const session = historySession({historyTurnCount: 0, id: large ? LARGE_DIFF_SESSION_ID : DIFF_SESSION_ID, title: large ? LARGE_DIFF_SESSION_TITLE : DIFF_SESSION_TITLE});
  const calls = ["first", "second", "plain"].map<ToolCall>((version, index) => {
    let args: ToolCall["arguments"];
    if (large && version === "second") {
      args = {path: "worker.ts", oldText: "Previous declarations", newText: "Updated declarations"};
    } else {
      args = {
        path: version === "plain" ? "notes.txt" : "worker.ts",
        content: Array.from({length: large ? 1_000 : 100}, (_, line) =>
          version === "plain"
            ? `Plain note ${line}`
            : `export const ${version}${line} = "${version} revision${large && line % 11 === 0 ? " with a long wrapped value".repeat(12) : ""}";`
        ).join("\n"),
      };
    }
    return {arguments: args, id: `diff-call-${index}`, name: large && version === "second" ? "edit" : "write", type: "toolCall"};
  });
  return {
    ...session,
    entries: {
      remaining: 0,
      items: [
        userEntry(1, "Inspect the recorded file changes", 0),
        assistantEntry(2, {...assistantMessage(calls, 200), stopReason: "toolUse"}),
        ...calls.map(
          (call, index) =>
            ({
              conversationId: 1,
              id: index + 3,
              kind: "pi.tool-result",
              model: [
                {
                  content: [{text: "Written successfully", type: "text"}],
                  details:
                    large && index === 1
                      ? {
                          patch: [
                            "--- a/worker.ts",
                            "+++ b/worker.ts",
                            ...[10_000, 50_000].flatMap((start) => [
                              `@@ -${start},500 +${start},500 @@`,
                              ...Array.from({length: 500}, (_, line) => `-export const previous${start + line} = "old";`),
                              ...Array.from({length: 500}, (_, line) => `+export const updated${start + line} = "new${line % 11 === 0 ? " wrapped value".repeat(20) : ""}";`),
                            ]),
                          ].join("\n"),
                        }
                      : undefined,
                  isError: false,
                  role: "toolResult",
                  timestamp: Date.parse(timestamp(300 + index)),
                  toolCallId: call.id,
                  toolName: call.name,
                },
              ],
            }) as unknown as EntryRecord
        ),
        assistantEntry(6, assistantMessage([{text: "The file changes are complete.", type: "text"}], 1000)),
      ],
    },
  };
}

function pagedHistorySession(): Session {
  const session = historySession({historyTurnCount: 12, id: PAGED_SESSION_ID, title: PAGED_SESSION_TITLE});
  return {
    ...session,
    entries: {
      remaining: 0,
      items: session.entries.items.map((entry, index) =>
        entry.kind === "pi.assistant"
          ? assistantEntry(
              entry.id,
              assistantMessage(
                [
                  {
                    type: "text",
                    text: Array.from({length: 5 + (index % 5) * 6}, (_, line) => `History ${index}, paragraph ${line}. ${"Variable-height history content. ".repeat(6)}`).join(
                      "\n\n"
                    ),
                  },
                ],
                index * 1_000
              )
            )
          : entry
      ),
    },
  };
}

/** Creates the sessions used by every isolated browser test. */
export function createTimelineSessions(): Map<string, Session> {
  const sessions = [
    historySession({historyTurnCount: 28, id: TIMELINE_SESSION_ID, title: TIMELINE_SESSION_TITLE}),
    historySession({historyTurnCount: 24, id: OTHER_SESSION_ID, title: OTHER_SESSION_TITLE}),
    historySession({historyTurnCount: 0, id: EMPTY_SESSION_ID, title: EMPTY_SESSION_TITLE}),
    workHistorySession(),
    diffHistorySession(),
    diffHistorySession(true),
    pagedHistorySession(),
  ];

  return new Map(sessions.map((session) => [session.id, session]));
}

/** Builds a summary for the real project-session list UI. */
export function timelineSessionSummary(session: Session): SessionSummary {
  return {forked: false, id: session.id, pinned: session.pinned, title: session.title, updatedAt: session.updatedAt, worktree: false};
}

/** Formats a unique full-height line emitted by the stress stream. */
export function timelineStreamLine(index: number): string {
  return `Stress stream line ${String(index).padStart(6, "0")} fills the viewport immediately.`;
}

/**
 * Builds the assistant answer of the stress stream, growing by complete lines. Each reasoning break is a line count
 * after which a reasoning step interrupts the response, so later lines flow into a fresh text part.
 */
export function timelineStreamMessage(input: {readonly lineCount: number; readonly reasoningBreaks?: readonly number[]}): AssistantMessage {
  const {lineCount, reasoningBreaks = []} = input;
  const segmentStarts = [0, ...reasoningBreaks.filter((lineIndex) => lineIndex > 0 && lineIndex < lineCount)];
  const content: AssistantMessage["content"] = [];

  segmentStarts.forEach((segmentStart, segmentIndex) => {
    const segmentEnd = segmentStarts[segmentIndex + 1] ?? lineCount;
    const lines = Array.from({length: segmentEnd - segmentStart}, (_, index) => timelineStreamLine(segmentStart + index + 1));
    if (reasoningBreaks.includes(segmentStart)) content.push({thinking: `Reasoning step ${segmentIndex} before continuing.`, type: "thinking"});
    content.push({text: lines.length > 0 ? ["Extreme-speed streamed response:", ...lines].join("\n") : "", type: "text"});
  });

  return assistantMessage(content, 90_000);
}
