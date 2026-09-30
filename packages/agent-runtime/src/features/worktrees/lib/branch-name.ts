import {randomInt} from "node:crypto";

export const WORKTREE_BRANCH_PREFIX = "supernova";

const ADJECTIVES = [
  "amber",
  "bold",
  "brisk",
  "calm",
  "clever",
  "cosmic",
  "crisp",
  "dusky",
  "eager",
  "fleet",
  "gentle",
  "golden",
  "hazy",
  "icy",
  "jolly",
  "keen",
  "lively",
  "lucid",
  "mellow",
  "misty",
  "nimble",
  "odd",
  "pale",
  "quick",
  "quiet",
  "rapid",
  "rosy",
  "rustic",
  "sharp",
  "silent",
  "sleek",
  "snowy",
  "solar",
  "sunny",
  "swift",
  "tidy",
  "vivid",
  "warm",
  "wild",
  "witty",
];

const NOUNS = [
  "aurora",
  "badger",
  "beacon",
  "canyon",
  "cedar",
  "comet",
  "coral",
  "crane",
  "delta",
  "ember",
  "falcon",
  "fjord",
  "glacier",
  "harbor",
  "heron",
  "island",
  "jasper",
  "kestrel",
  "lagoon",
  "lantern",
  "maple",
  "meadow",
  "nebula",
  "orbit",
  "otter",
  "pebble",
  "prairie",
  "quartz",
  "raven",
  "reef",
  "ridge",
  "river",
  "saffron",
  "summit",
  "thistle",
  "tundra",
  "valley",
  "walnut",
  "willow",
  "zephyr",
];

function pick(words: readonly string[]): string {
  return words[randomInt(words.length)]!;
}

/** `supernova/<adjective>-<noun>`; the session's title arrives later and is not needed to name the branch. */
export function randomBranchName(): string {
  return `${WORKTREE_BRANCH_PREFIX}/${pick(ADJECTIVES)}-${pick(NOUNS)}`;
}

/** The first of `name`, `name-2`, `name-3`, … not in `taken`. */
export function uniqueBranchName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${name}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
