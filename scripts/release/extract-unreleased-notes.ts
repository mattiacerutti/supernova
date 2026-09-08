import {readFileSync} from "node:fs";
import {changelogPath, formatReleaseNotes, locateUnreleasedSection} from "@scripts/release/lib";

// Nightly release bodies carry the entire unreleased changelog without promoting
// it to a version section.
const notes = formatReleaseNotes(locateUnreleasedSection(readFileSync(changelogPath, "utf8")).body);
if (notes !== "") {
  process.stdout.write(`${notes}\n`);
}
