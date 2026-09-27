import type {SendMessagePayload} from "@supernova/contracts/session-runtime/procedures";
import {randomUUID} from "node:crypto";
import type {PiModel} from "@supernova/agent-runtime/pi/sdk";
import {prepareSendMessageContext} from "@supernova/agent-runtime/features/session-runtime/worker/lib/send-message-context";
import {SessionWorker} from "@supernova/agent-runtime/features/session-runtime/worker/session-worker";
import type {TitleGenerator} from "@supernova/agent-runtime/features/session-runtime/worker/title-generator";

type GenerateSessionTitleOptions = {
  readonly input: SendMessagePayload;
  readonly model: PiModel;
  readonly titleGenerator: TitleGenerator;
};

async function generateSessionTitle(options: GenerateSessionTitleOptions): Promise<string | undefined> {
  const title = await options.titleGenerator.generateSessionTitle({contentParts: options.input.contentParts, model: options.model}).catch(() => undefined);
  return title?.trim() || undefined;
}

/** Accepts a user message and starts provider work on the long-lived session runtime. */
export async function sendMessage(runtime: SessionWorker, titleGenerator: TitleGenerator, input: SendMessagePayload): Promise<void> {
  runtime.beginWork();

  try {
    const sessionManager = await runtime.getSessionManager();
    // Selecting first lets an unknown or unauthenticated model fail before any provider work or checkpoint capture.
    const model = await runtime.selectModel(input.modelReference);

    const generatedTitle = sessionManager.getSessionName() === undefined ? await generateSessionTitle({input, model, titleGenerator}) : undefined;
    const messageContext = await prepareSendMessageContext(input, {
      projectPath: sessionManager.getCwd(),
      resourceCache: runtime.resourceCache,
    });

    const captureCheckpoints = input.captureCheckpoints ?? true;
    const checkpointId = randomUUID();
    const checkpointStatus = await runtime.createCheckpoint(checkpointId, captureCheckpoints);

    const {completion} = runtime.startTurn({beforeCheckpoint: {checkpointId, status: checkpointStatus}, captureCheckpoints, messageContext, title: generatedTitle});

    void completion
      .catch(async (cause) => {
        if (!runtime.isCancelled()) {
          runtime.publishEvent({
            type: "session.error",
            sessionId: runtime.sessionId,
            error: cause instanceof Error ? cause.message : "Failed to send message.",
          });
        }
      })
      .finally(() => runtime.endWork());
  } catch (cause) {
    runtime.endWork();
    throw cause;
  }
}
