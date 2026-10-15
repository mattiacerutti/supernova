import {readFileSync, writeFileSync} from "node:fs";

export const changelogPath = "CHANGELOG.md";

const desktopPackageJsonPath = "apps/desktop/package.json";

const packageJsonPaths = [
  desktopPackageJsonPath,
  "apps/server/package.json",
  "packages/agent-runtime/package.json",
  "packages/contracts/package.json",
  "packages/web/package.json",
];

interface UnreleasedSection {
  readonly start: number;
  readonly bodyStart: number;
  readonly end: number;
  readonly body: string;
}

export function readDesktopVersion(): string {
  return JSON.parse(readFileSync(desktopPackageJsonPath, "utf8")).version;
}

export function readReleaseVersion(): string {
  const releaseVersion = process.env.RELEASE_VERSION;
  if (!releaseVersion) {
    throw new Error("RELEASE_VERSION is required.");
  }

  return releaseVersion;
}

export function updatePackageVersions(version: string): void {
  for (const path of packageJsonPaths) {
    const packageJson = JSON.parse(readFileSync(path, "utf8"));
    packageJson.version = version;
    writeFileSync(path, `${JSON.stringify(packageJson, null, 2)}\n`);
  }
}

export function locateUnreleasedSection(changelog: string): UnreleasedSection {
  const unreleasedMatch = changelog.match(/^## \[Unreleased\]\s*$/m);
  if (!unreleasedMatch || unreleasedMatch.index === undefined) {
    throw new Error("CHANGELOG.md must contain a ## [Unreleased] section.");
  }

  const start = unreleasedMatch.index;
  const bodyStart = start + unreleasedMatch[0].length;
  const nextVersionMatch = changelog.slice(bodyStart).match(/^## \[/m);
  const end = nextVersionMatch && nextVersionMatch.index !== undefined ? bodyStart + nextVersionMatch.index : changelog.length;

  return {start, bodyStart, end, body: changelog.slice(bodyStart, end).trim()};
}

export function formatReleaseNotes(unreleasedBody: string): string {
  const sections: Array<string> = [];
  const preface: Array<string> = [];
  let currentHeading: string | undefined;
  let currentLines: Array<string> = [];

  function flushCurrentSection(): void {
    if (!currentHeading) return;

    const content = currentLines.join("\n").trim();
    if (content !== "") {
      sections.push(`${currentHeading}\n\n${content}`);
    }
  }

  // Prose before the first subsection is kept; a fresh Unreleased template still has every heading.
  for (const line of unreleasedBody.split("\n")) {
    if (line.startsWith("### ")) {
      flushCurrentSection();
      currentHeading = line;
      currentLines = [];
      continue;
    }

    if (currentHeading) {
      currentLines.push(line);
    } else {
      preface.push(line);
    }
  }

  flushCurrentSection();

  const prefaceText = preface.join("\n").trim();
  if (prefaceText !== "") {
    sections.unshift(prefaceText);
  }

  return sections.join("\n\n");
}
