import type {AgentSession} from "@mariozechner/pi-coding-agent";
import {Effect, Queue, Stream} from "effect";
import type {AgentSessionStreamEvent, IAgentModelReference, IAgentSessionSummary} from "@pi-desktop/contracts/sessions";
import {PiProviderSdkService} from "@pi-desktop/agent-runtime/providers/pi/providers/pi-provider-sdk";
import {generateSessionTitle} from "@pi-desktop/agent-runtime/providers/pi/sessions/lib/session-title-generator";
import {toPiThinkingLevel} from "@pi-desktop/agent-runtime/providers/pi/sessions/lib/thinking-levels";
import {PiSessionSdkService} from "@pi-desktop/agent-runtime/providers/pi/sessions/pi-session-sdk";
import {findSessionById} from "@pi-desktop/agent-runtime/providers/pi/sessions/lib/session-resolver";
import {normalizePiSessionTurns} from "@pi-desktop/agent-runtime/providers/pi/sessions/lib/session-mapper";

type PiAgentMessage = AgentSession["messages"][number];

interface ISendSessionMessageInput {
  message: string;
  model: IAgentModelReference;
  sessionId: string;
}

export function sendSessionMessage(input: ISendSessionMessageInput) {
  return Stream.unwrap(
    Effect.gen(function* () {
      const providerSdk = yield* PiProviderSdkService;
      const sessionSdk = yield* PiSessionSdkService;

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
            cancelled = cancelled || abort;
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
              const sessionInfo = await findSessionById(sessionSdk, input.sessionId);
              throwIfCancelled();

              const sessionManager = sessionSdk.openSessionManager(sessionInfo.path);

              const models = providerSdk.modelRegistry.getAvailable();
              const selectedModel = models.find((model) => model.provider === input.model.providerId && model.id === input.model.id);
              if (!selectedModel) throw new Error("Selected model is not available.");

              let needsTitleGeneration = sessionManager.getSessionName() === undefined;
              if (needsTitleGeneration) {
                const title = await generateSessionTitle({
                  message: input.message,
                  model: selectedModel,
                  modelRegistry: providerSdk.modelRegistry,
                  thinkingLevel: input.model.thinkingLevel,
                }).catch(() => input.message);

                sessionManager.appendSessionInfo(title);
              }
              throwIfCancelled();

              const {session} = await sessionSdk.createAgentSession({
                authStorage: providerSdk.authStorage,
                cwd: sessionInfo.cwd,
                modelRegistry: providerSdk.modelRegistry,
                sessionManager,
              });
              activeSession = session;
              throwIfCancelled();

              await session.setModel(selectedModel);
              session.setThinkingLevel(toPiThinkingLevel(input.model.thinkingLevel));

              emit({turns: normalizePiSessionTurns(session.messages, input.model), type: "ready"});

              const liveMessages = (message: PiAgentMessage): readonly PiAgentMessage[] =>
                session.messages.some((sessionMessage) => sessionMessage === message) ? session.messages : [...session.messages, message];

              const emitMessages = (messages: readonly PiAgentMessage[]): void => {
                const turn = normalizePiSessionTurns(messages, input.model).at(-1);
                if (!turn) return;

                const title = sessionManager.getSessionName();
                if (!needsTitleGeneration || !title) {
                  emit({turn: {...turn, status: "streaming"}, type: "turn"});
                  return;
                }

                const sessionSummary: IAgentSessionSummary = {
                  id: sessionInfo.id,
                  title: title,
                  updatedAt: new Date().toISOString(),
                };

                needsTitleGeneration = false;

                emit({session: sessionSummary, turn: {...turn, status: "streaming"}, type: "turn"});
              };

              unsubscribe = session.subscribe((event) => {
                if (event.type === "message_update" && "message" in event) {
                  emitMessages(liveMessages(event.message));
                }

                if (event.type === "message_end" && "message" in event) {
                  emitMessages(liveMessages(event.message));
                }

                if (event.type === "tool_execution_start") {
                  emitMessages(session.messages);
                }

                if (event.type === "tool_execution_end") {
                  emitMessages(session.messages);
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
