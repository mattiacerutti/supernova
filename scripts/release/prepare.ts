import {readFileSync, writeFileSync} from "node:fs";
import {changelogPath, formatReleaseNotes, locateUnreleasedSection, readReleaseVersion, updatePackageVersions} from "@scripts/release/lib";

const unreleasedTemplate = ["## [Unreleased]", "", "### Breaking Changes", "", "### Added", "", "### Changed", "", "### Fixed", "", "### Removed"].join("\n");

function promoteChangelogEntries(version: string): void {
  const changelog = readFileSync(changelogPath, "utf8");
  if (changelog.includes(`## [${version}]`)) {
    return;
  }

  const unreleased = locateUnreleasedSection(changelog);
  const releaseNotes = formatReleaseNotes(unreleased.body);
  if (releaseNotes === "") {
    throw new Error("CHANGELOG.md has no unreleased entries to release.");
  }

  const beforeUnreleased = changelog.slice(0, unreleased.start).trimEnd();
  const afterUnreleased = changelog.slice(unreleased.end).trimStart();
  const sections = [beforeUnreleased, unreleasedTemplate, `## [${version}]\n\n${releaseNotes}`];

  if (afterUnreleased !== "") {
    sections.push(afterUnreleased);
  }

  writeFileSync(changelogPath, `${sections.join("\n\n").trimEnd()}\n`);
}

const version = readReleaseVersion();
updatePackageVersions(version);

if (process.env.RELEASE_CHANNEL !== "nightly") {
  promoteChangelogEntries(version);
}
