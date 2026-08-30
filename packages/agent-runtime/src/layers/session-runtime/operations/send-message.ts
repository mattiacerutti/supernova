import type {SendMessagePayload} from "@supernova/contracts/session-runtime/procedures";
import {randomUUID} from "node:crypto";
import type {PiModel} from "@supernova/agent-runtime/layers/shared/internal/pi-model-catalog";
import {prepareSendMessageContext} from "@supernova/agent-runtime/layers/session-runtime/lib/user-message/send-message-context";
import {PiSessionRuntime} from "@supernova/agent-runtime/layers/session-runtime/internal/pi-session-runtime";
import type {PiSessionTitleGeneratorShape} from "@supernova/agent-runtime/layers/session-runtime/internal/pi-session-title-generator";

type GenerateSessionTitleOptions = {
  readonly input: SendMessagePayload;
  readonly model: PiModel;
  readonly titleGenerator: PiSessionTitleGeneratorShape;
};

async function generateSessionTitle(options: GenerateSessionTitleOptions): Promise<string | undefined> {
  const title = await options.titleGenerator.generateSessionTitle({contentParts: options.input.contentParts, model: options.model}).catch(() => undefined);
  return title?.trim() || undefined;
}

/** Accepts a user message and starts provider work on the long-lived session runtime. */
export async function sendMessage(runtime: PiSessionRuntime, titleGenerator: PiSessionTitleGeneratorShape, input: SendMessagePayload): Promise<void> {
  runtime.beginWork();

  try {
    const sessionManager = await runtime.getSessionManager();
    const selectedModel = input.modelReference;
    const model = runtime.resolveModel(selectedModel);

    const generatedTitle = sessionManager.getSessionName() === undefined ? await generateSessionTitle({input, model, titleGenerator}) : undefined;
    const messageContext = await prepareSendMessageContext(input, {
      projectPath: sessionManager.getCwd(),
      resourceCatalog: runtime.resourceCatalog,
    });

    const captureCheckpoints = input.captureCheckpoints ?? true;
    const checkpointId = randomUUID();
    const checkpointStatus = await runtime.createCheckpoint(checkpointId, captureCheckpoints);
    await runtime.selectModel(selectedModel);

    const {completion} = runtime.startTurn({beforeCheckpoint: {checkpointId, status: checkpointStatus}, captureCheckpoints, messageContext, title: generatedTitle});

    void completion
      .catch(async (cause) => {
        if (!runtime.isCancelled()) {
          await runtime.publishEvent({
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
