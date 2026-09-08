import {appendFileSync} from "node:fs";
import {readDesktopVersion} from "@scripts/release/lib";

/** Nightlies build on the next stable patch version, so they always sort above the current release. */
function resolveNightlyBaseVersion(version: string): string {
  const stableCore = version.replace(/[-+].*$/, "");
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(stableCore);
  if (!match) {
    throw new Error(`Invalid desktop package version "${version}".`);
  }

  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
}

const runNumber = process.env.GITHUB_RUN_NUMBER;
if (!runNumber) {
  throw new Error("GITHUB_RUN_NUMBER is required.");
}

const sha = process.env.GITHUB_SHA;
if (!sha) {
  throw new Error("GITHUB_SHA is required.");
}

const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const version = `${resolveNightlyBaseVersion(readDesktopVersion())}-nightly.${date}.${runNumber}`;

const outputs = [
  ["version", version],
  ["tag", `v${version}`],
  ["release_name", `Supernova Nightly ${version} (${sha.slice(0, 12)})`],
] as const;

const githubOutput = process.env.GITHUB_OUTPUT;
if (githubOutput) {
  appendFileSync(githubOutput, outputs.map(([key, value]) => `${key}=${value}\n`).join(""));
} else {
  for (const [key, value] of outputs) {
    console.log(`${key}=${value}`);
  }
}
