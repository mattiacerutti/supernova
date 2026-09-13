import type {WorkspaceChangeEntry, WorkspaceFileNode, WorkspaceSnapshot} from "@/features/workspace/types/workspace";

// Throwaway data so the UI can be built before the workspace API exists.

const LOCKFILE_LINE_COUNT = 9_000;

function file(path: string): WorkspaceFileNode {
  return {kind: "file", name: path.slice(path.lastIndexOf("/") + 1), path};
}

function directory(path: string, children: readonly WorkspaceFileNode[]): WorkspaceFileNode {
  return {children, kind: "directory", name: path.slice(path.lastIndexOf("/") + 1), path};
}

const UNCOMMITTED: readonly WorkspaceChangeEntry[] = [
  {additions: 1_240, deletions: 388, path: "packages/web/src/features/workspace/components/workspace-panel.tsx", status: "modified"},
  {additions: 56, deletions: 18, path: "packages/web/src/features/workspace/components/file-tree/workspace-tree.tsx", status: "modified"},
  {additions: 91, deletions: 0, path: "packages/web/src/features/workspace/components/file-tree/file-tree-row.tsx", status: "added"},
  {additions: 0, deletions: 139, path: "packages/web/src/features/workspace/components/file-tree/legacy-tree.tsx", status: "deleted"},
  {additions: 17, deletions: 0, path: "packages/web/src/features/workspace/lib/tree.ts", status: "untracked"},
  {
    additions: 4,
    deletions: 13,
    path: "packages/web/src/features/workspace/lib/file-info.ts",
    previousPath: "packages/web/src/features/workspace/lib/file-language.ts",
    status: "renamed",
  },
  {additions: 167, deletions: 42, path: "packages/web/src/features/sessions/components/session-layout.tsx", status: "modified"},
  {additions: 12, deletions: 3, path: "packages/web/src/features/sessions/pages/session-page.tsx", status: "modified"},
  {additions: 68, deletions: 47, path: "packages/web/src/app/styles.css", status: "modified"},
  {additions: 9, deletions: 2, path: "packages/web/src/components/ui/icon.tsx", status: "modified"},
  {additions: 44, deletions: 70, path: "apps/desktop/src/window.ts", status: "modified"},
  {additions: 204, deletions: 0, path: "apps/server/src/workspace/git-status.ts", status: "added"},
  {additions: 0, deletions: 40, path: "apps/server/src/workspace/old-tabs.ts", status: "deleted"},
  {additions: 3, deletions: 1, path: "docs/product.md", status: "modified"},
  {additions: 22, deletions: 0, path: "CHANGELOG.md", status: "modified"},
];

const FILES: readonly WorkspaceFileNode[] = [
  directory("apps", [
    directory("apps/desktop", [directory("apps/desktop/src", [file("apps/desktop/src/main.ts"), file("apps/desktop/src/window.ts")]), file("apps/desktop/package.json")]),
    directory("apps/server", [
      directory("apps/server/src", [directory("apps/server/src/workspace", [file("apps/server/src/workspace/git-status.ts")]), file("apps/server/src/index.ts")]),
      file("apps/server/package.json"),
    ]),
  ]),
  directory("packages", [
    directory("packages/web", [
      directory("packages/web/src", [
        directory("packages/web/src/features", [
          directory("packages/web/src/features/sessions", [file("packages/web/src/features/sessions/pages/session-page.tsx")]),
          directory("packages/web/src/features/workspace", [
            file("packages/web/src/features/workspace/components/workspace-panel.tsx"),
            file("packages/web/src/features/workspace/lib/tree.ts"),
          ]),
        ]),
        directory("packages/web/src/app", [file("packages/web/src/app/styles.css"), file("packages/web/src/app/routes.tsx")]),
        // Overflows the panel to exercise expansion animations.
        directory(
          "packages/web/src/generated",
          Array.from({length: 200}, (_, index) => file(`packages/web/src/generated/schema-${String(index).padStart(3, "0")}.ts`))
        ),
      ]),
      file("packages/web/package.json"),
    ]),
    directory("packages/contracts", [file("packages/contracts/package.json")]),
  ]),
  directory("docs", [file("docs/product.md"), file("docs/release.md")]),
  ...["AGENTS.md", "CHANGELOG.md", "README.md", "bun.lock", "package.json", "turbo.json"].map(file),
];

const COMMIT_SUBJECTS = [
  "feat(workspace): Add uncommitted changes panel",
  "fix(timeline): Keep scroll anchored while streaming",
  "refactor(sessions): Extract composer draft store",
  "perf(diffs): Cache parsed patches per file",
  "chore(deps): Bump Electron to the latest stable",
  "feat(desktop): Restore window bounds on launch",
  "fix(sidebar): Preserve expanded projects across reloads",
  "docs: Document the checkpoint system",
  "test(web): Cover the session timeline virtualizer",
  "feat(settings): Add appearance contrast control",
  "fix(server): Retry Pi runtime reconnects",
  "style(web): Tighten sidebar spacing",
];

const AUTHORS = ["Mattia Cerutti", "Ada Lovelace", "Grace Hopper"];

export const MOCK_WORKSPACE: WorkspaceSnapshot = {
  commits: COMMIT_SUBJECTS.map((subject, index) => ({
    additions: 40 + index * 37,
    authorName: AUTHORS[index % AUTHORS.length]!,
    authoredAt: new Date(Date.now() - (index + 1) * 5 * 3_600_000).toISOString(),
    deletions: 5 + index * 11,
    id: `${(0x1a2b3c4d + index * 0x9e3779b1).toString(16)}e8f9a0b1c2d3e4f5`,
    subject,
  })),
  files: FILES,
  uncommitted: UNCOMMITTED,
};

export function mockCommitChanges(commitId: string): readonly WorkspaceChangeEntry[] {
  const index = MOCK_WORKSPACE.commits.findIndex((commit) => commit.id === commitId);
  return UNCOMMITTED.slice(index % 6, (index % 6) + 4);
}

export function mockPatch(entry: WorkspaceChangeEntry): string {
  const lines = [
    `diff --git a/${entry.path} b/${entry.path}`,
    `--- ${entry.status === "added" || entry.status === "untracked" ? "/dev/null" : `a/${entry.path}`}`,
    `+++ ${entry.status === "deleted" ? "/dev/null" : `b/${entry.path}`}`,
  ];
  let remainingAdditions = entry.additions;
  let remainingDeletions = entry.deletions;
  let lineNumber = 1;

  while (remainingAdditions > 0 || remainingDeletions > 0) {
    const removed = Math.min(remainingDeletions, 20);
    const added = Math.min(remainingAdditions, 20);
    lines.push(`@@ -${lineNumber},${removed + 2} +${lineNumber},${added + 2} @@`, " const context = true;");
    for (let index = 0; index < removed; index += 1) lines.push(`-  const removed${lineNumber + index} = resolve(${index});`);
    for (let index = 0; index < added; index += 1) lines.push(`+  const added${lineNumber + index} = resolve(${index});`);
    lines.push(" return context;");
    remainingAdditions -= added;
    remainingDeletions -= removed;
    lineNumber += Math.max(added, removed) + 30;
  }

  return lines.join("\n");
}

export function mockFileContent(path: string): string {
  const lineCount = path.endsWith("bun.lock") ? LOCKFILE_LINE_COUNT : 120;
  return Array.from({length: lineCount}, (_, index) => (index % 4 === 0 ? `export const value${index} = ${index};` : `  const line${index} = resolve("${path}", ${index});`)).join(
    "\n"
  );
}
