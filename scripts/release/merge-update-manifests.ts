// electron-updater reads a single manifest per platform and channel (for example
// latest-mac.yml), but macOS arm64 and x64 builds each emit their own. Merging
// the file lists lets both architectures resolve updates from one manifest.

import {readFileSync, writeFileSync} from "node:fs";

interface UpdateManifestFile {
  readonly url: string;
  readonly sha512: string;
  readonly size: number;
}

type UpdateManifestScalar = string | number | boolean;

interface UpdateManifest {
  readonly version: string;
  readonly releaseDate: string;
  readonly files: ReadonlyArray<UpdateManifestFile>;
  readonly extras: Readonly<Record<string, UpdateManifestScalar>>;
}

interface MutableUpdateManifestFile {
  url?: string;
  sha512?: string;
  size?: number;
}

function stripSingleQuotes(value: string): string {
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function parseFileRecord(currentFile: MutableUpdateManifestFile | null, sourcePath: string, lineNumber: number): UpdateManifestFile | null {
  if (currentFile === null) {
    return null;
  }
  if (typeof currentFile.url !== "string" || typeof currentFile.sha512 !== "string" || typeof currentFile.size !== "number") {
    throw new Error(`Invalid update manifest at ${sourcePath}:${lineNumber}: incomplete file entry.`);
  }
  return {
    url: currentFile.url,
    sha512: currentFile.sha512,
    size: currentFile.size,
  };
}

function parseScalarValue(rawValue: string): UpdateManifestScalar {
  const trimmed = rawValue.trim();
  const isQuoted = trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2;
  const value = isQuoted ? trimmed.slice(1, -1).replace(/''/g, "'") : trimmed;
  if (isQuoted) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return value;
}

function quoteYamlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function serializeScalarValue(value: UpdateManifestScalar): string {
  if (typeof value === "string") {
    return quoteYamlString(value);
  }
  return String(value);
}

function mergeExtras(primary: Readonly<Record<string, UpdateManifestScalar>>, secondary: Readonly<Record<string, UpdateManifestScalar>>): Record<string, UpdateManifestScalar> {
  const merged: Record<string, UpdateManifestScalar> = {...primary};

  for (const [key, value] of Object.entries(secondary)) {
    const existing = merged[key];
    if (existing !== undefined && existing !== value) {
      throw new Error(`Cannot merge update manifests: conflicting "${key}" values ("${existing}" vs "${value}").`);
    }
    merged[key] = value;
  }

  return merged;
}

function parseUpdateManifest(raw: string, sourcePath: string): UpdateManifest {
  const lines = raw.split(/\r?\n/);
  const files: UpdateManifestFile[] = [];
  const extras: Record<string, UpdateManifestScalar> = {};
  let version: string | null = null;
  let releaseDate: string | null = null;
  let inFiles = false;
  let currentFile: MutableUpdateManifestFile | null = null;

  for (const [index, rawLine] of lines.entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trimEnd();
    if (line.length === 0) continue;

    const fileUrlMatch = line.match(/^ {2}- url:\s*(.+)$/);
    if (fileUrlMatch?.[1]) {
      const finalized = parseFileRecord(currentFile, sourcePath, lineNumber);
      if (finalized) files.push(finalized);
      currentFile = {url: stripSingleQuotes(fileUrlMatch[1].trim())};
      inFiles = true;
      continue;
    }

    const fileShaMatch = line.match(/^ {4}sha512:\s*(.+)$/);
    if (fileShaMatch?.[1]) {
      if (currentFile === null) {
        throw new Error(`Invalid update manifest at ${sourcePath}:${lineNumber}: sha512 without a file entry.`);
      }
      currentFile.sha512 = stripSingleQuotes(fileShaMatch[1].trim());
      continue;
    }

    const fileSizeMatch = line.match(/^ {4}size:\s*(\d+)$/);
    if (fileSizeMatch?.[1]) {
      if (currentFile === null) {
        throw new Error(`Invalid update manifest at ${sourcePath}:${lineNumber}: size without a file entry.`);
      }
      currentFile.size = Number(fileSizeMatch[1]);
      continue;
    }

    if (line === "files:") {
      inFiles = true;
      continue;
    }

    if (inFiles && currentFile !== null) {
      const finalized = parseFileRecord(currentFile, sourcePath, lineNumber);
      if (finalized) files.push(finalized);
      currentFile = null;
    }
    inFiles = false;

    const topLevelMatch = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.+)$/);
    if (!topLevelMatch?.[1] || topLevelMatch[2] === undefined) {
      throw new Error(`Invalid update manifest at ${sourcePath}:${lineNumber}: unsupported line "${line}".`);
    }

    const [, key, rawValue] = topLevelMatch;
    const value = parseScalarValue(rawValue);

    if (key === "version") {
      if (typeof value !== "string") {
        throw new Error(`Invalid update manifest at ${sourcePath}:${lineNumber}: version must be a string.`);
      }
      version = value;
      continue;
    }

    if (key === "releaseDate") {
      if (typeof value !== "string") {
        throw new Error(`Invalid update manifest at ${sourcePath}:${lineNumber}: releaseDate must be a string.`);
      }
      releaseDate = value;
      continue;
    }

    // Top-level path/sha512 duplicate the first file entry; the merged manifest drops them.
    if (key === "path" || key === "sha512") {
      continue;
    }

    extras[key] = value;
  }

  const finalized = parseFileRecord(currentFile, sourcePath, lines.length);
  if (finalized) files.push(finalized);

  if (!version) {
    throw new Error(`Invalid update manifest at ${sourcePath}: missing version.`);
  }
  if (!releaseDate) {
    throw new Error(`Invalid update manifest at ${sourcePath}: missing releaseDate.`);
  }
  if (files.length === 0) {
    throw new Error(`Invalid update manifest at ${sourcePath}: missing files.`);
  }

  return {
    version,
    releaseDate,
    files,
    extras,
  };
}

function mergeUpdateManifests(primary: UpdateManifest, secondary: UpdateManifest): UpdateManifest {
  if (primary.version !== secondary.version) {
    throw new Error(`Cannot merge update manifests with different versions (${primary.version} vs ${secondary.version}).`);
  }

  const filesByUrl = new Map<string, UpdateManifestFile>();
  for (const file of [...primary.files, ...secondary.files]) {
    const existing = filesByUrl.get(file.url);
    if (existing && (existing.sha512 !== file.sha512 || existing.size !== file.size)) {
      throw new Error(`Cannot merge update manifests: conflicting file entry for ${file.url}.`);
    }
    filesByUrl.set(file.url, file);
  }

  return {
    version: primary.version,
    releaseDate: primary.releaseDate >= secondary.releaseDate ? primary.releaseDate : secondary.releaseDate,
    files: [...filesByUrl.values()],
    extras: mergeExtras(primary.extras, secondary.extras),
  };
}

function serializeUpdateManifest(manifest: UpdateManifest): string {
  const lines = [`version: ${quoteYamlString(manifest.version)}`, "files:"];

  for (const file of manifest.files) {
    lines.push(`  - url: ${file.url}`);
    lines.push(`    sha512: ${file.sha512}`);
    lines.push(`    size: ${file.size}`);
  }

  for (const key of Object.keys(manifest.extras).toSorted()) {
    const value = manifest.extras[key];
    if (value === undefined) {
      throw new Error(`Cannot serialize update manifest: missing value for "${key}".`);
    }
    lines.push(`${key}: ${serializeScalarValue(value)}`);
  }

  lines.push(`releaseDate: ${quoteYamlString(manifest.releaseDate)}`);
  lines.push("");
  return lines.join("\n");
}

const [primaryPath, secondaryPath, outputPath] = process.argv.slice(2);
if (!primaryPath || !secondaryPath) {
  throw new Error("Usage: bun scripts/merge-update-manifests.ts <primary-path> <secondary-path> [output-path]");
}

const primary = parseUpdateManifest(readFileSync(primaryPath, "utf8"), primaryPath);
const secondary = parseUpdateManifest(readFileSync(secondaryPath, "utf8"), secondaryPath);
writeFileSync(outputPath ?? primaryPath, serializeUpdateManifest(mergeUpdateManifests(primary, secondary)));
