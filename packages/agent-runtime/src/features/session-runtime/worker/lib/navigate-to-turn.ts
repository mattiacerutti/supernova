import {CheckpointInheritedError, CheckpointUncapturedError} from "@supernova/contracts/services/session-runtime/procedures";
import type {CheckpointRef} from "@supernova/agent-runtime/pi/lib/session/session-state";
import type {NavigationState} from "@supernova/agent-runtime/pi/session-file";
import type {SessionWorker} from "@supernova/agent-runtime/features/session-runtime/worker/session-worker";

/**
 * Back: the first hidden turn's before-checkpoint, which keeps manual edits made before it. Forward: the last shown
 * turn's after-checkpoint.
 */
function boundaryAt(navigation: NavigationState, count: number): CheckpointRef | undefined {
  return count < navigation.visibleCount ? navigation.turns[count]?.record.before : navigation.turns[count - 1]?.record.after;
}

/** An uncovered target moves the conversation alone. `force` bypasses the uncovered-current check and conflicts only. */
export async function navigateToTurn(runtime: SessionWorker, input: {readonly target: (navigation: NavigationState) => number; readonly force: boolean}): Promise<void> {
  const {file} = runtime;
  const navigation = await file.navigation();
  const count = input.target(navigation);
  const target = boundaryAt(navigation, count);
  const current = navigation.current;
  if (target?.status === "captured") {
    // A fork copies its history but not the workspace snapshots behind it, so those boundaries cannot restore files.
    if (target.sessionId !== file.sessionId) throw new CheckpointInheritedError({message: "This message came from the session this one was forked from."});
    const currentCaptured = current?.status === "captured" && current.sessionId === file.sessionId;
    if (!currentCaptured && !input.force) {
      throw new CheckpointUncapturedError({message: "The current checkpoint has no workspace snapshot. Restoring may discard uncaptured changes."});
    }
    await runtime.restoreCheckpoint({checkpointId: target.checkpointId, force: input.force, fromCheckpointId: currentCaptured ? current.checkpointId : undefined});
  }
  await file.show(navigation.turns, count, target);
  await runtime.refresh();
}
