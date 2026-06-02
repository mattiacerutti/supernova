import {describe, expect, it} from "vitest";
import {formatSuggestionPath, normalizeProjectPath, projectNameFromPath, withTrailingProjectPathSeparator} from "@/features/projects/lib/project-paths";

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

  it.each([
    {homePath: String.raw`C:\Users\person`, input: String.raw`C:\Users\person\repo`, output: {name: "repo", parent: "~/", suffix: "/"}},
    {homePath: "c:/users/person", input: "C:/Users/Person/repo", output: {name: "repo", parent: "~/", suffix: "/"}},
    {homePath: String.raw`\\server\share`, input: String.raw`\\server\share\repo`, output: {name: "repo", parent: "~/", suffix: "/"}},
    {homePath: "/home/person", input: "/home/person/repo", output: {name: "repo", parent: "~/", suffix: "/"}},
    {homePath: "/home/other", input: "/home/person/repo", output: {name: "repo", parent: "/home/person/", suffix: "/"}},
  ])("formats suggestion path for $input", ({homePath, input, output}) => {
    expect(formatSuggestionPath(input, homePath)).toEqual(output);
  });

  it("appends a slash-delimited trailing separator", () => {
    expect(withTrailingProjectPathSeparator(String.raw`C:\Users\person\repo`)).toBe("C:/Users/person/repo/");
  });
});
