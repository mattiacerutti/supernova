interface DisplayDiffLine {
  readonly content: string;
  readonly lineNumber: number;
  readonly marker: "+" | "-" | " ";
}

function parseDisplayDiffLine(line: string): DisplayDiffLine | "gap" | undefined {
  const marker = line.at(0);
  if (marker !== "+" && marker !== "-" && marker !== " ") return undefined;

  const raw = line.slice(1);
  if (marker === " " && raw.trim() === "...") return "gap";

  const match = raw.match(/^\s*(\d+)\s(.*)$/);
  if (!match) return undefined;

  return {content: match[2] ?? "", lineNumber: Number.parseInt(match[1] ?? "1", 10), marker};
}

function hunkHeader(lines: readonly DisplayDiffLine[], firstChangedLine: number | undefined): string {
  const firstOldLine = lines.find((line) => line.marker !== "+")?.lineNumber;
  const firstNewLine = lines.find((line) => line.marker !== "-")?.lineNumber;
  const oldLineCount = lines.filter((line) => line.marker !== "+").length;
  const newLineCount = lines.filter((line) => line.marker !== "-").length;
  const oldStart = firstOldLine ?? Math.max((firstNewLine ?? firstChangedLine ?? 1) - 1, 0);
  const newStart = firstNewLine ?? firstChangedLine ?? oldStart;

  return `@@ -${oldStart},${oldLineCount} +${newStart},${newLineCount} @@`;
}

/** Converts Pi's edit display diff into a standard unified patch. */
export function piEditDiffToPatch(input: {readonly diff: string | undefined; readonly firstChangedLine: number | undefined; readonly path: string | undefined}): string {
  if (!input.diff) return "";

  const hunks = input.diff.split("\n").reduce<DisplayDiffLine[][]>(
    (groups, line) => {
      const parsed = parseDisplayDiffLine(line);
      if (parsed === undefined) return groups;
      if (parsed === "gap") return [...groups, []];

      const current = groups.at(-1) ?? [];
      return [...groups.slice(0, -1), [...current, parsed]];
    },
    [[]]
  );

  const path = input.path ?? "unknown file";
  const body = hunks.filter((lines) => lines.length > 0).flatMap((lines) => [hunkHeader(lines, input.firstChangedLine), ...lines.map((line) => `${line.marker}${line.content}`)]);

  return [`--- a/${path}`, `+++ b/${path}`, ...body].join("\n");
}

/** Converts full file content into a standard new-file unified patch. */
export function fileContentToNewFilePatch(input: {readonly content: string | undefined; readonly path: string | undefined}): string {
  const path = input.path ?? "unknown file";
  const lines = (input.content ?? "").split("\n");
  if (lines.at(-1) === "") lines.pop();

  return [`--- /dev/null`, `+++ b/${path}`, `@@ -0,0 +1,${lines.length} @@`, ...lines.map((line) => `+${line}`)].join("\n");
}
