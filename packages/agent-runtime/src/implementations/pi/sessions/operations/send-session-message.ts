import type {AgentSession} from "@mariozechner/pi-coding-agent";
import {Effect, Queue, Stream} from "effect";
import type {AgentSessionStreamEvent, IAgentModelReference, IAgentSessionSummary} from "@pi-desktop/contracts/sessions";
import {PiSdkService} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import {generateSessionTitle} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/session-title-generator";
import {toPiThinkingLevel} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/thinking-levels";
import {findSessionById} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/session-resolver";
import {normalizePiSessionTurns} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/session-mapper";

type PiAgentMessage = AgentSession["messages"][number];

interface ISendSessionMessageInput {
  message: string;
  model: IAgentModelReference;
  sessionId: string;
}

export function sendSessionMessage(input: ISendSessionMessageInput) {
  return Stream.unwrap(
    Effect.gen(function* () {
      const piSdk = yield* PiSdkService;

      return Stream.callback<AgentSessionStreamEvent>((queue) =>
        Effect.gen(function* () {
          const emit = (event: AgentSessionStreamEvent): void => {
            Queue.offerUnsafe(queue, event);
          };

          let cancelled = false;
          let activeSession: AgentSession | undefined;
          let unsubscribe: (() => void) | undefined;
          let releasePromise: Promise<void> | undefined;

          const release = async (abort: boolean): Promise<void> => {
            cancelled ||= abort;
            if (!activeSession && !unsubscribe) return;
            if (releasePromise) return releasePromise;

            releasePromise = (async () => {
              if (abort) await activeSession?.abort().catch(() => undefined);
              unsubscribe?.();
              activeSession?.dispose();
            })();

            return releasePromise;
          };

          const throwIfCancelled = (): void => {
            if (cancelled) throw new Error("Stream was cancelled.");
          };

          yield* Effect.addFinalizer(() => Effect.promise(() => release(true)));

          void (async () => {
            try {
              const sessionInfo = await findSessionById(piSdk, input.sessionId);
              throwIfCancelled();

              const sessionManager = piSdk.SessionManager.open(sessionInfo.path);

              const models = piSdk.modelRegistry.getAvailable();
              const selectedModel = models.find((model) => model.provider === input.model.providerId && model.id === input.model.id);
              if (!selectedModel) throw new Error("Selected model is not available.");

              let needsTitleGeneration = sessionManager.getSessionName() === undefined;
              if (needsTitleGeneration) {
                const title = await generateSessionTitle({
                  message: input.message,
                  model: selectedModel,
                  modelRegistry: piSdk.modelRegistry,
                }).catch(() => input.message);

                sessionManager.appendSessionInfo(title);
              }
              throwIfCancelled();

              const {session} = await piSdk.createAgentSession({
                authStorage: piSdk.authStorage,
                cwd: sessionInfo.cwd,
                modelRegistry: piSdk.modelRegistry,
                sessionManager,
              });
              activeSession = session;
              throwIfCancelled();

              await session.setModel(selectedModel);
              session.setThinkingLevel(toPiThinkingLevel(input.model.thinkingLevel));

              emit({turns: normalizePiSessionTurns(session.messages, input.model), type: "ready"});

              const currentMessages = (message: PiAgentMessage): readonly PiAgentMessage[] =>
                session.messages.some((m) => m === message) ? session.messages : [...session.messages, message];

              const emitMessages = (messages: readonly PiAgentMessage[]): void => {
                const turn = normalizePiSessionTurns(messages, input.model).at(-1);
                if (!turn) return;

                const title = sessionManager.getSessionName();

                if (needsTitleGeneration && title) {
                  needsTitleGeneration = false;
                  const sessionSummary: IAgentSessionSummary = {
                    id: sessionInfo.id,
                    title,
                    updatedAt: new Date().toISOString(),
                  };
                  emit({session: sessionSummary, turn: {...turn, status: "streaming"}, type: "turn"});
                  return;
                }

                emit({turn: {...turn, status: "streaming"}, type: "turn"});
              };

              unsubscribe = session.subscribe((event) => {
                switch (event.type) {
                  case "message_update":
                  case "message_end": {
                    if ("message" in event) {
                      emitMessages(currentMessages(event.message));
                    }
                    break;
                  }
                  case "tool_execution_start":
                  case "tool_execution_end": {
                    emitMessages(session.messages);
                    break;
                  }
                }
              });

              try {
                await session.prompt(input.message);
                const finalTurns = normalizePiSessionTurns(session.messages, input.model);
                emit({turns: finalTurns, type: "done"});
              } finally {
                await release(false);
              }
            } catch (cause) {
              if (cancelled) return;
              const error = cause instanceof Error ? cause.message : "Failed to send message.";
              emit({error, type: "error"});
            } finally {
              await release(cancelled);
              Queue.endUnsafe(queue);
            }
          })();
        })
      );
    })
  );
}
