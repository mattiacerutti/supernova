import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import AssistantTurnWork from "@/features/sessions/components/timeline/items/work/assistant-turn-work";
import AssistantWork from "@/features/sessions/components/timeline/items/work/assistant-work";
import type {WorkSessionTimelineItem} from "@/features/sessions/types/session-timeline-item";

// These server-render tests have no Worker runtime; browser tests exercise the real pool.
vi.mock("@/lib/diffs/worker-pool", () => ({getDiffWorkerPool: async () => undefined}));

const work: WorkSessionTimelineItem = {
  durationMs: 1000,
  final: false,
  id: "work",
  live: false,
  spacing: "work",
  turnId: "turn",
  type: "work",
  events: Array.from({length: 40}, (_, index) => ({
    id: `event-${index}`,
    timestamp: "2026-01-01T00:00:00.000Z",
    type: "tool",
    tool: {arguments: {command: `echo hidden-work-marker-${index}`}, callId: `call-${index}`, name: "bash", output: undefined, result: undefined, status: "completed"},
  })),
};

describe("collapsed timeline work", () => {
  it.each([
    [
      "settled turn",
      <AssistantTurnWork item={{durationMs: 1000, final: false, id: "turn-work", items: [{...work, live: true}], spacing: "work", turnId: "turn", type: "turn-work"}} />,
    ],
    ["tool group", <AssistantWork item={work} />],
  ])("does not mount the hidden rows of a %s", (_, element) => {
    const html = renderToStaticMarkup(element);

    expect(html).not.toContain("hidden-work-marker");
    expect(html.match(/<button\b/g)).toHaveLength(1);
  });

  it("mounts live work immediately", () => {
    const html = renderToStaticMarkup(<AssistantWork item={{...work, live: true}} />);

    expect(html).toContain("hidden-work-marker-39");
    expect(html).toContain('aria-expanded="true"');
  });
});
