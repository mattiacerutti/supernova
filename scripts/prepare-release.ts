import {readFileSync, writeFileSync} from "node:fs";

const changelogPath = "CHANGELOG.md";
const packageJsonPaths = [
  "apps/desktop/package.json",
  "apps/server/package.json",
  "packages/agent-runtime/package.json",
  "packages/contracts/package.json",
  "packages/web/package.json",
];

const unreleasedTemplate = ["## [Unreleased]", "", "### Breaking Changes", "", "### Added", "", "### Changed", "", "### Fixed", "", "### Removed"].join("\n");

function readReleaseVersion(): string {
  const releaseVersion = process.env.RELEASE_VERSION;
  if (!releaseVersion) {
    throw new Error("RELEASE_VERSION is required.");
  }

  return releaseVersion;
}

function updatePackageVersions(version: string): void {
  for (const path of packageJsonPaths) {
    const packageJson = JSON.parse(readFileSync(path, "utf8"));
    packageJson.version = version;
    writeFileSync(path, `${JSON.stringify(packageJson, null, 2)}\n`);
  }
}

function formatReleaseNotes(unreleasedBody: string): string {
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

  // Keep version release notes compact while preserving any prose before the
  // first subsection. The fresh Unreleased template still includes all headings.
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

function promoteChangelogEntries(version: string): void {
  const changelog = readFileSync(changelogPath, "utf8");
  // Release jobs can be retried after metadata is already prepared.
  if (changelog.includes(`## [${version}]`)) {
    return;
  }

  const unreleasedMatch = changelog.match(/^## \[Unreleased\]\s*$/m);
  if (!unreleasedMatch || unreleasedMatch.index === undefined) {
    throw new Error("CHANGELOG.md must contain a ## [Unreleased] section.");
  }

  const unreleasedStart = unreleasedMatch.index;
  const unreleasedBodyStart = unreleasedStart + unreleasedMatch[0].length;
  const nextVersionMatch = changelog.slice(unreleasedBodyStart).match(/^## \[/m);
  const unreleasedEnd = nextVersionMatch && nextVersionMatch.index !== undefined ? unreleasedBodyStart + nextVersionMatch.index : changelog.length;
  const unreleasedBody = changelog.slice(unreleasedBodyStart, unreleasedEnd).trim();

  const releaseNotes = formatReleaseNotes(unreleasedBody);
  if (releaseNotes === "") {
    throw new Error("CHANGELOG.md has no unreleased entries to release.");
  }

  const beforeUnreleased = changelog.slice(0, unreleasedStart).trimEnd();
  const afterUnreleased = changelog.slice(unreleasedEnd).trimStart();
  // Reset Unreleased for the next cycle and append the current notes as the
  // version section consumed by the GitHub Release body.
  const sections = [beforeUnreleased, unreleasedTemplate, `## [${version}]\n\n${releaseNotes}`];

  if (afterUnreleased !== "") {
    sections.push(afterUnreleased);
  }

  writeFileSync(changelogPath, `${sections.join("\n\n").trimEnd()}\n`);
}

const version = readReleaseVersion();
updatePackageVersions(version);
promoteChangelogEntries(version);
