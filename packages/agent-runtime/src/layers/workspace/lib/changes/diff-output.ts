import type {WorkspaceChangeEntry, WorkspaceChangeStatus} from "@supernova/contracts/workspace/schemas";

/** Parses `git diff --numstat -z` output into per-path line counts. Binary files report `-` and count as zero. */
export function parseNumstat(output: string): Map<string, {additions: number; deletions: number}> {
  const counts = new Map<string, {additions: number; deletions: number}>();
  const fields = output.split("\0");
  for (let index = 0; index < fields.length; index += 1) {
    const match = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(fields[index] ?? "");
    if (!match) continue;
    // Renames put an empty path in the record and the old/new paths in the next two fields.
    const path = match[3] === "" ? (fields[index + 2] ?? "") : match[3]!;
    if (match[3] === "") index += 2;
    counts.set(path, {additions: Number(match[1]) || 0, deletions: Number(match[2]) || 0});
  }
  return counts;
}

/** Parses `git diff --name-status -z` output into ordered entries, joined with line counts from numstat. */
export function parseNameStatus(output: string, counts: ReadonlyMap<string, {additions: number; deletions: number}>): WorkspaceChangeEntry[] {
  const fields = output.split("\0").filter((field) => field.length > 0);
  const entries: WorkspaceChangeEntry[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const code = fields[index]![0];
    const path = fields[index + 1] ?? "";
    index += 1;
    let status: WorkspaceChangeStatus = "modified";
    let finalPath = path;
    if (code === "A") status = "added";
    else if (code === "D") status = "deleted";
    else if (code === "R" || code === "C") {
      status = "renamed";
      finalPath = fields[index + 1] ?? path;
      index += 1;
    }
    entries.push({...(counts.get(finalPath) ?? {additions: 0, deletions: 0}), path: finalPath, status});
  }
  return entries;
}
