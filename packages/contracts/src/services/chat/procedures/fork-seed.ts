import {arr, map, obj, opt, type Static, str, unknown} from "@earendil-works/chord";
import {json} from "@supernova/contracts/lib/protocol";
import type {EntryRecord} from "@supernova/contracts/services/chat/schemas";

export const ForkSeed = obj({
  entries: arr(json<EntryRecord>()),
  checkpoints: map(unknown()),
  model: opt(obj({provider: str(), modelId: str(), thinkingLevel: str()})),
});

export const ForkSeedPayload = obj({turnId: str()});

export type ForkSeed = Static<typeof ForkSeed>;
export type ForkSeedPayload = Static<typeof ForkSeedPayload>;
