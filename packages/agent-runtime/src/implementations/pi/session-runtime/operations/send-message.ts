import type {SendMessagePayload} from "@supernova/contracts/sessions/procedures";
import {ActiveTurn} from "@supernova/agent-runtime/implementations/pi/session-runtime/lib/turns/active-turn";
import {prepareSendMessageContext} from "@supernova/agent-runtime/implementations/pi/session-runtime/lib/user-message/send-message-context";
import {PiSessionRuntime} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/pi-session-runtime";
import type {OpenedRuntimeSession} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/pi-session-runtime";

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
      await runtime.sendActiveTurnPrompt(activeTurn);
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

  return new ActiveTurn(
    {
      sessionInfo: openedSession.sessionInfo,
      modelReference: openedSession.modelReference,
      messageContext,
      baseParentId: baseBranch.at(-1)?.id ?? null,
    },
    sessionManager
  );
}
