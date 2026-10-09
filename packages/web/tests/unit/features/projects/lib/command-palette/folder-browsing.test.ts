import {describe, expect, it} from "vitest";
import {
  buildFolderBrowserRows,
  filterFolderSuggestions,
  formatSuggestionPath,
  getProjectBrowseDirectoryPath,
  getProjectBrowseLeafPath,
  getProjectBrowseParentPath,
  resolveFolderPath,
  resolveProjectBrowsePath,
  withTrailingProjectPathSeparator,
} from "@/features/projects/lib/command-palette/folder-browsing";

describe("folder browsing helpers", () => {
  it.each([
    {homePath: String.raw`C:\Users\person`, input: String.raw`C:\Users\person\repo`, output: {name: "repo", parent: "~/", suffix: "/"}},
    {homePath: "c:/users/person", input: "C:/Users/Person/repo", output: {name: "repo", parent: "~/", suffix: "/"}},
    {homePath: String.raw`\\server\share`, input: String.raw`\\server\share\repo`, output: {name: "repo", parent: "~/", suffix: "/"}},
    {homePath: "/home/person", input: "/home/person/repo", output: {name: "repo", parent: "~/", suffix: "/"}},
    {homePath: "/home/other", input: "/home/person/repo", output: {name: "repo", parent: "/home/person/", suffix: "/"}},
  ])("formats suggestion path for $input", ({homePath, input, output}) => {
    expect(formatSuggestionPath(input, homePath)).toEqual(output);
  });

  it.each([
    {directory: "~/", input: "~/De", leaf: "De", name: "home path"},
    {directory: "/home/person/", input: "/home/person/repo", leaf: "repo", name: "unix path"},
    {directory: "C:\\Users\\person\\", input: String.raw`C:\Users\person\repo`, leaf: "repo", name: "windows path"},
    {directory: "", input: "repo", leaf: "repo", name: "home search"},
    {directory: "~/repo/", input: "~/repo/", leaf: "", name: "directory path"},
  ])("splits the browse directory and leaf for a $name", ({directory, input, leaf}) => {
    expect(getProjectBrowseDirectoryPath(input)).toBe(directory);
    expect(getProjectBrowseLeafPath(input)).toBe(leaf);
  });

  it.each([
    {input: "~/Development/", parent: "~/"},
    {input: "/home/person/repo/", parent: "/home/person/"},
    {input: "C:/Users/person/repo/", parent: "C:/Users/person/"},
    {input: "/", parent: null},
    {input: "C:/", parent: null},
  ])("finds the browse parent for $input", ({input, parent}) => {
    expect(getProjectBrowseParentPath(input)).toBe(parent);
  });

  it("resolves a browse leaf against the server directory", () => {
    expect(resolveProjectBrowsePath("/home/person/", "repo")).toBe("/home/person/repo");
    expect(resolveProjectBrowsePath("C:/Users/person/", "repo")).toBe("C:/Users/person/repo");
  });

  it("appends a slash-delimited trailing separator", () => {
    expect(withTrailingProjectPathSeparator(String.raw`C:\Users\person\repo`)).toBe("C:/Users/person/repo/");
  });
});

describe("folder browser rows and resolution", () => {
  const listing = {
    homePath: "/home/person",
    query: "/home/person/",
    queryPath: "/home/person",
    queryPathType: "directory" as const,
    suggestions: [
      {name: ".config", path: "/home/person/.config"},
      {name: "repo", path: "/home/person/repo"},
      {name: "repo-two", path: "/home/person/repo-two"},
    ],
  };

  it("filters folders by the typed leaf and hides dot folders unless asked for", () => {
    expect(filterFolderSuggestions(listing, "").map((folder) => folder.name)).toEqual(["repo", "repo-two"]);
    expect(filterFolderSuggestions(listing, "RE").map((folder) => folder.name)).toEqual(["repo", "repo-two"]);
    expect(filterFolderSuggestions(listing, ".").map((folder) => folder.name)).toEqual([".config"]);
  });

  it("resolves the typed path to the listed folder, an exact child, or a missing folder", () => {
    expect(resolveFolderPath("/home/person/", listing)).toEqual({path: "/home/person", type: "directory"});
    expect(resolveFolderPath("/home/person/repo", listing)).toEqual({path: "/home/person/repo", type: "directory"});
    expect(resolveFolderPath("/home/person/new", listing)).toEqual({path: "/home/person/new", type: "missing"});
  });

  it("lists recent projects only while nothing is typed, then the parent and the folders", () => {
    const folders = listing.suggestions.slice(1);
    expect(buildFolderBrowserRows({folders, projectPath: "", recentProjectPaths: ["/work/app"]})).toEqual([
      {id: "recent-projects", title: "Recent projects", type: "header"},
      {kind: "recent", path: "/work/app", type: "folder"},
      {id: "open-project", title: "Open project", type: "header"},
      {kind: "folder", path: "/home/person/repo", type: "folder"},
      {kind: "folder", path: "/home/person/repo-two", type: "folder"},
    ]);
    expect(buildFolderBrowserRows({folders, projectPath: "/home/person/re", recentProjectPaths: ["/work/app"]})).toEqual([
      {kind: "parent", path: "/home/", type: "folder"},
      {kind: "folder", path: "/home/person/repo", type: "folder"},
      {kind: "folder", path: "/home/person/repo-two", type: "folder"},
    ]);
  });
});
