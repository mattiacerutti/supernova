import {readFileSync} from "node:fs";
import {changelogPath, formatReleaseNotes, locateUnreleasedSection} from "@scripts/release/lib";

const notes = formatReleaseNotes(locateUnreleasedSection(readFileSync(changelogPath, "utf8")).body);
if (notes !== "") {
  process.stdout.write(`${notes}\n`);
}
