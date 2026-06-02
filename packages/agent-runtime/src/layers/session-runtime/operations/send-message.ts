import type {SendMessagePayload} from "@supernova/contracts/session-runtime/procedures";
import {randomUUID} from "node:crypto";
import {
  CHECKPOINT_CURSOR_CUSTOM_TYPE,
  CHECKPOINT_CUSTOM_TYPE,
  isCheckpointEntry,
} from "@supernova/agent-runtime/layers/session-runtime/lib/checkpoints/checkpoint-navigation";
import {ActiveTurn} from "@supernova/agent-runtime/layers/session-runtime/lib/turns/active-turn";
import {prepareSendMessageContext} from "@supernova/agent-runtime/layers/session-runtime/lib/user-message/send-message-context";
import {PiSessionRuntime} from "@supernova/agent-runtime/layers/session-runtime/internal/pi-session-runtime";
import type {OpenedRuntimeSession} from "@supernova/agent-runtime/layers/session-runtime/internal/pi-session-runtime";

/** Accepts a user message and starts provider work on the long-lived session runtime. */
export async function sendMessage(runtime: PiSessionRuntime, input: SendMessagePayload): Promise<void> {
  runtime.beginWork();

  const openedSession = await openSession(runtime, input);
  const activeTurn = await createActiveTurn(runtime, openedSession, input);

  runtime.activateTurn(activeTurn);

  void (async () => {
    try {
      await runtime.publishSessionUpdate(openedSession);

      activeTurn.appendCustomEntries();

      await runtime.sendActiveTurn(activeTurn, async () => {
        const checkpointId = createCheckpointId();

        //NOTE: Every time a message is sent, we want to create a checkpoint to capture the session state after the turn is completed.
        await runtime.createCheckpoint({checkpointId, cwd: openedSession.sessionInfo.cwd});
        openedSession.sessionManager.appendCustomEntry(CHECKPOINT_CUSTOM_TYPE, {checkpointId});

        //NOTE: Sending a message should always reset the tree navigation, so we append a cursor pointing at the new checkpoint.
        const leafEntryId = openedSession.sessionManager.getLeafId();
        openedSession.sessionManager.appendCustomEntry(CHECKPOINT_CURSOR_CUSTOM_TYPE, {leafEntryId});
      });
    } catch (cause) {
      if (!runtime.isCancelled()) {
        await runtime.publishEvent({
          type: "session.error",
          sessionId: runtime.sessionId,
          error: cause instanceof Error ? cause.message : "Failed to send message.",
        });
      }
    } finally {
      runtime.endWork();
    }
  })();
}

async function openSession(runtime: PiSessionRuntime, input: SendMessagePayload): Promise<OpenedRuntimeSession> {
  const openedSession = await runtime.openSession(runtime.sessionId, input.model);

  if (openedSession.sessionManager.getSessionName() !== undefined) return openedSession;

  const title = await runtime.titleGenerator.generateSessionTitle({contentParts: input.contentParts, model: openedSession.model}).catch(() => "Unknown session");
  openedSession.sessionManager.appendSessionInfo(title);

  return {...openedSession, titleWasGenerated: true};
}

async function createActiveTurn(runtime: PiSessionRuntime, openedSession: OpenedRuntimeSession, input: SendMessagePayload): Promise<ActiveTurn> {
  const sessionManager = openedSession.sessionManager;
  const baseBranch = sessionManager.getBranch();

  const messageContext = await prepareSendMessageContext(input, {projectPath: openedSession.sessionInfo.cwd, resourceCatalog: runtime.resourceCatalog});

  const customEntries = [];

  if (!baseBranch.some(isCheckpointEntry)) {
    const checkpointId = createCheckpointId();
    await runtime.createCheckpoint({checkpointId, cwd: openedSession.sessionInfo.cwd});
    customEntries.push({customType: CHECKPOINT_CUSTOM_TYPE, data: {checkpointId}});
  }

  return new ActiveTurn(
    {
      sessionInfo: openedSession.sessionInfo,
      customEntries,
      modelReference: openedSession.modelReference,
      messageContext,
      baseParentId: baseBranch.at(-1)?.id ?? null,
    },
    sessionManager
  );
}

function createCheckpointId(): string {
  return randomUUID();
}
