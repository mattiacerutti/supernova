import {describe, expect, it} from "vitest";
import {CHECKPOINT_CUSTOM_TYPE, isCapturedCheckpoint} from "@supernova/agent-runtime/layers/session-runtime/lib/checkpoints/checkpoint-entries";
import type {CheckpointEntry, CheckpointStatus} from "@supernova/agent-runtime/layers/session-runtime/lib/checkpoints/checkpoint-entries";

function checkpointEntry(status: CheckpointStatus | undefined): CheckpointEntry {
  return {
    customType: CHECKPOINT_CUSTOM_TYPE,
    data: {checkpointId: "checkpoint-id", phase: "before-turn", ...(status === undefined ? {} : {status})},
    id: "checkpoint-1",
    parentId: null,
    timestamp: "1970-01-01T00:00:00.000Z",
    type: "custom",
  } as CheckpointEntry;
}

describe("checkpoint coverage", () => {
  const cases = [
    {covered: true, name: "entries written before the status field existed", status: undefined},
    {covered: true, name: "captured boundaries", status: "captured"},
    {covered: false, name: "boundaries whose capture failed", status: "failed"},
    {covered: false, name: "boundaries recorded while checkpointing was disabled", status: "disabled"},
  ] as const;

  for (const {covered, name, status} of cases) {
    it(`reports ${name} as ${covered ? "covered" : "uncovered"}`, () => {
      expect(isCapturedCheckpoint(checkpointEntry(status))).toBe(covered);
    });
  }
});
