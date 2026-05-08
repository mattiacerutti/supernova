import {createAgentSession, type AgentSession, SessionManager} from "@mariozechner/pi-coding-agent";
import type {ThinkingLevel} from "@mariozechner/pi-ai";
import {Effect, Queue, Stream} from "effect";
import type {AgentSessionStreamEvent, IAgentModelReference} from "@pi-desktop/contracts/sessions";
import {authStorage, modelRegistry} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/pi-provider-runtime";
import {findSessionById} from "@pi-desktop/agent-runtime/providers/pi/sessions/session-resolver";
import {normalizePiSessionTurns} from "@pi-desktop/agent-runtime/providers/pi/sessions/lib/session-mapper";

type PiAgentMessage = AgentSession["messages"][number];

interface ISendSessionMessageInput {
  message: string;
  model: IAgentModelReference;
  sessionId: string;
}

const piThinkingLevels = new Set<string>(["off", "minimal", "low", "medium", "high", "xhigh"]);

function toPiThinkingLevel(value: string | undefined): ThinkingLevel {
  return value && piThinkingLevels.has(value) ? (value as ThinkingLevel) : ("off" as ThinkingLevel);
}

export function sendSessionMessage(input: ISendSessionMessageInput): Stream.Stream<AgentSessionStreamEvent> {
  return Stream.callback<AgentSessionStreamEvent>((queue) =>
    Effect.sync(() => {
      const emit = (event: AgentSessionStreamEvent): void => {
        Queue.offerUnsafe(queue, event);
      };

      void (async () => {
        try {
          const sessionInfo = await findSessionById(input.sessionId);
          const {session} = await createAgentSession({
            authStorage,
            cwd: sessionInfo.cwd,
            modelRegistry,
            sessionManager: SessionManager.open(sessionInfo.path),
          });

          const models = await modelRegistry.getAvailable();
          const selectedModel = models.find((model) => model.provider === input.model.providerId && model.id === input.model.id);
          if (!selectedModel) throw new Error("Selected model is not available.");
          await session.setModel(selectedModel);
          session.setThinkingLevel(toPiThinkingLevel(input.model.thinkingLevel));

          emit({turns: normalizePiSessionTurns(session.messages, input.model), type: "ready"});

          const liveMessages = (message: PiAgentMessage): readonly PiAgentMessage[] =>
            session.messages.some((sessionMessage) => sessionMessage === message) ? session.messages : [...session.messages, message];

          const emitMessages = (messages: readonly PiAgentMessage[]): void => {
            const turn = normalizePiSessionTurns(messages, input.model).at(-1);
            if (turn) emit({turn: {...turn, status: "streaming"}, type: "turn"});
          };

          const unsubscribe = session.subscribe((event) => {
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
            unsubscribe();
            session.dispose();
          }
        } catch (cause) {
          const error = cause instanceof Error ? cause.message : "Failed to send message.";
          emit({error, type: "error"});
        } finally {
          Queue.endUnsafe(queue);
        }
      })();
    })
  );
}
