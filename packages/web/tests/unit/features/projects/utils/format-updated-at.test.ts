import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {formatUpdatedAt} from "@/features/projects/utils/format-updated-at";

describe("formatUpdatedAt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    {input: "not-a-date", name: "invalid dates", output: ""},
    {input: "2026-04-07T12:01:00.000Z", name: "future dates", output: "now"},
    {input: "2026-04-07T11:59:30.000Z", name: "sub-minute ages", output: "now"},
    {input: "2026-04-07T11:45:00.000Z", name: "minute ages", output: "15m"},
    {input: "2026-04-07T06:00:00.000Z", name: "hour ages", output: "6h"},
    {input: "2026-04-06T12:00:00.000Z", name: "day ages", output: "1d"},
    {input: "2026-03-09T12:00:00.000Z", name: "older day ages", output: "29d"},
    {input: "2026-03-08T12:00:00.000Z", name: "month ages", output: "1mo"},
    {input: "2026-01-07T12:00:00.000Z", name: "older month ages", output: "3mo"},
  ])("formats $name", ({input, output}) => {
    expect(formatUpdatedAt(input)).toBe(output);
  });
});
