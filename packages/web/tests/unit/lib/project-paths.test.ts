import {describe, expect, it} from "vitest";
import {normalizeProjectPath, projectNameFromPath} from "@/lib/project-paths";

describe("project path helpers", () => {
  it.each([
    {input: "C:\\Users\\person\\repo\\", name: "windows drive path", output: "C:/Users/person/repo"},
    {input: "C:/Users/person/repo/", name: "normalized windows drive path", output: "C:/Users/person/repo"},
    {input: "\\\\server\\share\\repo\\", name: "UNC path", output: "//server/share/repo"},
    {input: "/home/person/repo/", name: "unix path", output: "/home/person/repo"},
    {input: "C:/", name: "windows drive root", output: "C:/"},
    {input: "/", name: "unix root", output: "/"},
  ])("normalizes $name", ({input, output}) => {
    expect(normalizeProjectPath(input)).toBe(output);
  });

  it.each([
    {input: String.raw`C:\Users\person\repo`, name: "repo"},
    {input: String.raw`\\server\share\repo`, name: "repo"},
    {input: "/home/person/repo", name: "repo"},
  ])("extracts project name from $input", ({input, name}) => {
    expect(projectNameFromPath(input)).toBe(name);
  });
});
