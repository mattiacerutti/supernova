import {homedir} from "node:os";
import {resolve, sep} from "node:path";
import {describe, expect, it} from "vitest";
import {resolveProjectPath} from "@supernova/agent-runtime/lib/project-path";

describe("project path identity", () => {
  it.runIf(process.platform === "win32").each([
    ["C:\\Users\\Alice\\app", "C:/Users/Alice/app"],
    ["C:/Users/Alice/app/", "C:/Users/Alice/app"],
    ["C:\\Users/Alice\\app\\.\\src\\..", "C:/Users/Alice/app"],
    ["C:\\", "C:/"],
    ["\\\\server\\share\\app\\..\\", "//server/share/"],
    ["\\\\server\\share\\app", "//server/share/app"],
    ["//server/share/app/", "//server/share/app"],
  ])("resolves Windows path %s to %s", (input, expected) => {
    expect(resolveProjectPath(input)).toBe(expected);
    expect(resolveProjectPath(expected)).toBe(expected);
  });

  it.each([
    ["app/./src/..", `${process.cwd().split(sep).join("/")}/app`],
    ["~", homedir().split(sep).join("/")],
    ["~/app/../project", `${homedir().split(sep).join("/")}/project`],
  ])("resolves %s to %s", (input, expected) => {
    expect(resolveProjectPath(input)).toBe(expected);
    expect(resolveProjectPath(expected)).toBe(expected);
  });

  it("does not require a project to exist", () => {
    expect(resolveProjectPath("missing-project/child/..")).toBe(resolve("missing-project").split(sep).join("/"));
  });

  it.skipIf(process.platform === "win32")("preserves case and literal backslashes on POSIX", () => {
    expect(resolveProjectPath("/workspace/App\\name/../Project")).toBe("/workspace/Project");
    expect(resolveProjectPath("/workspace/App\\name")).toBe("/workspace/App\\name");
  });
});
