import {CheckpointInheritedError, CheckpointUncapturedError} from "@supernova/contracts/services/session-runtime/procedures";
import type {CheckpointRef} from "@supernova/agent-runtime/pi/lib/session/session-state";
import type {NavigationState} from "@supernova/agent-runtime/pi/session-store";
import type {SessionWorker} from "@supernova/agent-runtime/features/session-runtime/worker/session-worker";

/**
 * The boundary the workspace returns to when `count` turns are shown. Going back, it is the before-turn checkpoint of
 * the first hidden turn, which keeps manual changes made before it was sent. Going forward, it is the after-turn
 * checkpoint of the last shown turn.
 */
function boundaryAt(navigation: NavigationState, count: number): CheckpointRef | undefined {
  return count < navigation.visibleCount ? navigation.turns[count]?.record.before : navigation.turns[count - 1]?.record.after;
}

/**
 * Restores the workspace for the first `target(navigation)` turns and shows them. An uncovered target moves the
 * conversation alone. A captured target with an uncovered current boundary requires `force`, which also discards
 * conflicting manual changes; it bypasses no other check.
 */
export async function navigateToTurn(runtime: SessionWorker, input: {readonly target: (navigation: NavigationState) => number; readonly force: boolean}): Promise<void> {
  await runtime.beginWork();
  try {
    const navigation = await runtime.store.navigation(runtime.sessionId);
    const count = input.target(navigation);
    const target = boundaryAt(navigation, count);
    const current = navigation.current;
    if (target?.status === "captured") {
      // A fork copies its history but not the workspace snapshots behind it, so those boundaries cannot restore files.
      if (target.sessionId !== runtime.sessionId) throw new CheckpointInheritedError({message: "This message came from the session this one was forked from."});
      const currentCaptured = current?.status === "captured" && current.sessionId === runtime.sessionId;
      if (!currentCaptured && !input.force) {
        throw new CheckpointUncapturedError({message: "The current checkpoint has no workspace snapshot. Restoring may discard uncaptured changes."});
      }
      await runtime.restoreCheckpoint({checkpointId: target.checkpointId, force: input.force, fromCheckpointId: currentCaptured ? current.checkpointId : undefined});
    }
    await runtime.store.show(runtime.sessionId, count, target);
    await runtime.refresh();
  } finally {
    runtime.endWork();
  }
}
