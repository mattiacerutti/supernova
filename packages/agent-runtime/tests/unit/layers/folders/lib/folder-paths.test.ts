import {describe, expect, it} from "vitest";
import {normalizePathForDisplay} from "@supernova/agent-runtime/layers/folders/lib/folder-paths";

describe("folder path normalization", () => {
  it.each([
    {input: String.raw`C:\Users\person\repo`, name: "windows drive path", output: "C:/Users/person/repo"},
    {input: "C:/Users/person/repo", name: "already normalized drive path", output: "C:/Users/person/repo"},
    {input: String.raw`\\server\share\repo`, name: "windows UNC path", output: "//server/share/repo"},
    {input: String.raw`src\components/button.tsx`, name: "relative windows path", output: "src/components/button.tsx"},
  ])("normalizes $name", ({input, output}) => {
    expect(normalizePathForDisplay(input)).toBe(output);
  });
});
