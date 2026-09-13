import type {WorkspaceChangeEntry} from "@supernova/contracts/workspace/schemas";
import {describe, expect, it} from "vitest";
import {buildFlatList, buildTree} from "@/features/workspace/lib/file-tree";
import type {FileTreeNode} from "@/features/workspace/lib/file-tree";

function outline(nodes: readonly FileTreeNode[], depth = 0): string[] {
  return nodes.flatMap((node) => [`${"  ".repeat(depth)}${node.label}`, ...outline(node.children, depth + 1)]);
}

describe("buildTree", () => {
  it.each([
    {name: "collapses single-directory chains into one row", paths: ["packages/website/src/routes/index.tsx"], want: ["packages/website/src/routes", "  index.tsx"]},
    {
      name: "stops collapsing where a directory branches",
      paths: ["packages/web/src/panel.tsx", "packages/web/tests/panel.test.ts"],
      want: ["packages/web", "  src", "    panel.tsx", "  tests", "    panel.test.ts"],
    },
    {
      name: "orders directories before files, each group alphabetical",
      paths: ["zebra.ts", "apps/web/a.ts", "alpha.ts", "docs/readme.md"],
      want: ["apps/web", "  a.ts", "docs", "  readme.md", "alpha.ts", "zebra.ts"],
    },
    {name: "ignores stray separators", paths: ["/leading.ts"], want: ["leading.ts"]},
    {name: "handles no files", paths: [], want: []},
  ])("$name", ({paths, want}) => {
    expect(outline(buildTree(paths))).toEqual(want);
  });

  it("attaches the change entry to its file node", () => {
    const entry: WorkspaceChangeEntry = {additions: 4, deletions: 0, path: "docs/new.md", status: "added"};
    const [directory] = buildTree([entry.path], new Map([[entry.path, entry]]));
    expect(directory?.children[0]?.changeEntry).toBe(entry);
  });
});

describe("buildFlatList", () => {
  it("lists files sorted by path with their directory as a prefix", () => {
    const nodes = buildFlatList(["src/b.ts", "a.ts", "src/a.ts"]);
    expect(nodes.map((node) => [node.directoryLabel, node.label])).toEqual([
      ["", "a.ts"],
      ["src", "a.ts"],
      ["src", "b.ts"],
    ]);
  });
});
