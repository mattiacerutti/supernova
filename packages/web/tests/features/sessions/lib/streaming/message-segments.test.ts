import {describe, expect, it} from "vitest";
import {segmentStreamingMessage} from "@/features/sessions/lib/streaming/message-segments";

describe("segmentStreamingMessage", () => {
  it("renders only complete paragraphs as markdown while a trailing paragraph is still streaming", () => {
    expect(segmentStreamingMessage("First paragraph.\n\nSecond paragraph is still changing")).toEqual([
      {mode: "markdown", text: "First paragraph.\n\n"},
      {mode: "text", text: "Second paragraph is still changing"},
    ]);
  });

  it("keeps an unfinished fenced block as text and leaves the stable prelude as markdown", () => {
    expect(segmentStreamingMessage("Intro paragraph.\n\n```ts\nconst value = 1;")).toEqual([
      {mode: "markdown", text: "Intro paragraph.\n\n"},
      {mode: "text", text: "```ts\nconst value = 1;"},
    ]);
  });

  it("does not close a longer fence with a shorter nested marker", () => {
    expect(segmentStreamingMessage("````markdown\n```ts\nconst value = 1;\n```\nstill inside the outer fence")).toEqual([
      {mode: "text", text: "````markdown\n```ts\nconst value = 1;\n```\nstill inside the outer fence"},
    ]);
  });
});
