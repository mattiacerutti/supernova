import {describe, expect, it} from "vitest";
import {randomBranchName, uniqueBranchName} from "@supernova/agent-runtime/features/worktrees/lib/branch-name";

describe("worktree branch names", () => {
  it("builds prefixed adjective-noun names", () => {
    expect(randomBranchName()).toMatch(/^supernova\/[a-z]+-[a-z]+$/);
  });

  it("suffixes taken names", () => {
    const taken = new Set(["supernova/x", "supernova/x-2"]);
    expect(uniqueBranchName("supernova/x", taken)).toBe("supernova/x-3");
    expect(uniqueBranchName("supernova/y", taken)).toBe("supernova/y");
  });
});
