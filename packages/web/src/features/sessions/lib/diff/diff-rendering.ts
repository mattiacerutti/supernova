import {parsePatchFiles} from "@pierre/diffs";
import type {FileDiffMetadata} from "@pierre/diffs";
import murmurHash from "imurmurhash";
import {LRUCache} from "lru-cache";

const MAX_PARSED_DIFF_CACHE_ENTRIES = 200;
const MAX_PARSED_DIFF_CACHE_MEMORY_BYTES = 8 * 1024 * 1024;

const parsedDiffCache = new LRUCache<string, {readonly fileDiff: FileDiffMetadata | undefined}>({
  max: MAX_PARSED_DIFF_CACHE_ENTRIES,
  maxSize: MAX_PARSED_DIFF_CACHE_MEMORY_BYTES,
  sizeCalculation: (entry, key) => key.length * 2 + (entry.fileDiff === undefined ? 0 : (entry.fileDiff.additionLines.length + entry.fileDiff.deletionLines.length) * 80),
});

function buildParsedDiffCacheKey(input: {patch: string; path: string | undefined}): string {
  const hash = murmurHash(input.patch).result().toString(36);
  return `${input.path ?? "unknown"}:${input.patch.length}:${hash}`;
}

/** Parses a unified patch into Pierre diff metadata, caching both valid and invalid results. */
export function parseFileEditPatch(input: {patch: string; path: string | undefined}): FileDiffMetadata | undefined {
  const cacheKey = buildParsedDiffCacheKey(input);
  const cached = parsedDiffCache.get(cacheKey);
  if (cached !== undefined) return cached.fileDiff;

  try {
    const fileDiff = parsePatchFiles(input.patch, `edit-tool:${cacheKey}`, true).at(0)?.files.at(0);
    parsedDiffCache.set(cacheKey, {fileDiff}, {size: input.patch.length * 2});
    return fileDiff;
  } catch {
    parsedDiffCache.set(cacheKey, {fileDiff: undefined}, {size: input.patch.length * 2});
    return undefined;
  }
}
