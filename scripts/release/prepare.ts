import {readFileSync, writeFileSync} from "node:fs";
import {changelogPath, formatReleaseNotes, locateUnreleasedSection, readReleaseVersion, updatePackageVersions} from "@scripts/release/lib";

const unreleasedTemplate = ["## [Unreleased]", "", "### Breaking Changes", "", "### Added", "", "### Changed", "", "### Fixed", "", "### Removed"].join("\n");

function promoteChangelogEntries(version: string): void {
  const changelog = readFileSync(changelogPath, "utf8");
  // Release jobs can be retried after metadata is already prepared.
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

// Nightly builds only align package versions: the changelog stays unreleased
// and becomes the nightly release notes.
if (process.env.RELEASE_CHANNEL !== "nightly") {
  promoteChangelogEntries(version);
}
