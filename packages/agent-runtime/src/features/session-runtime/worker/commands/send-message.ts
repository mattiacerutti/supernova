import type {SendMessagePayload} from "@supernova/contracts/session-runtime/procedures";
import {preparePromptImages} from "@supernova/agent-runtime/pi/lib/user-message/prompt-images";
import {findSelectedModel} from "@supernova/agent-runtime/pi/lib/models/selected-model";
import {toPiThinkingLevel} from "@supernova/agent-runtime/pi/lib/models/thinking-levels";
import type {PiModel} from "@supernova/agent-runtime/pi/sdk";
import {prepareSendMessageContext} from "@supernova/agent-runtime/features/session-runtime/worker/lib/send-message-context";
import type {SessionWorker} from "@supernova/agent-runtime/features/session-runtime/worker/session-worker";
import type {TitleGenerator} from "@supernova/agent-runtime/features/session-runtime/worker/title-generator";

async function generateSessionTitle(input: {readonly payload: SendMessagePayload; readonly model: PiModel; readonly titleGenerator: TitleGenerator}): Promise<string | undefined> {
  const title = await input.titleGenerator.generateSessionTitle({contentParts: input.payload.contentParts, model: input.model}).catch(() => undefined);
  return title?.trim() || undefined;
}

/**
 * Accepts a user message: selects its model, prepares its content, captures the before-turn checkpoint, and submits
 * it. Resolves once the engine placed it; the run continues in the background and settles through the session's event
 * stream. A busy session rejects; see `SessionFile.submit` for queueing.
 */
export async function sendMessage(runtime: SessionWorker, titleGenerator: TitleGenerator, input: SendMessagePayload): Promise<void> {
  runtime.beginSend();
  const session = await runtime.session();
  const record = await runtime.store.record(runtime.sessionId);
  // Selecting first lets an unknown or unauthenticated model fail before any provider work or checkpoint capture.
  const model = findSelectedModel(runtime.sdk, input.modelReference);
  if (!(await runtime.sdk.modelRuntime.checkAuth(model.provider))) throw new Error(`No API key for ${model.provider}/${model.id}`);

  // The title is not needed to start; it is generated alongside the turn and applied when it arrives.
  if (record.title === undefined) {
    runtime.track(
      generateSessionTitle({payload: input, model, titleGenerator}).then(async (title) => {
        // A user rename that lands first wins.
        if (!title || (await runtime.store.record(runtime.sessionId)).title !== undefined) return;
        await runtime.store.update(runtime.sessionId, (current) => ({...current, title}));
        await runtime.refresh();
      })
    );
  }

  const messageContext = await prepareSendMessageContext(input, {projectPath: session.cwd, resourceCache: runtime.resourceCache});
  const settings = runtime.store.settings(session.cwd);
  const {images, hints} = await preparePromptImages(messageContext.images, {autoResize: settings.getImageAutoResize(), model: model as never});
  const text = hints.length > 0 ? `${messageContext.prompt}\n\n${hints.join("\n")}` : messageContext.prompt;
  if (runtime.isCancelled()) throw new Error("Session was cancelled.");

  const turnModel = {provider: model.provider, modelId: model.id, thinkingLevel: toPiThinkingLevel(input.modelReference.thinkingLevel)};
  await session.configure(turnModel);
  const capture = input.captureCheckpoints ?? true;
  const before = await runtime.createCheckpoint(capture);
  const submitted = await runtime.submit(() =>
    session.submit({
      content: images.length > 0 ? [{type: "text", text}, ...images] : text,
      record: {contentParts: [...messageContext.contentParts], capture, before},
    })
  );
  await runtime.store.update(runtime.sessionId, (current) => ({...current, updatedAt: new Date().toISOString()}));

  void submitted.wait().then(
    (settled) => {
      // Aborts are user-initiated; model errors show in the turn itself as assistant errors.
      if (settled.status === "unanswered" && settled.reason !== "aborted" && settled.reason !== "model_error") {
        runtime.reportError(typeof settled.detail === "string" ? settled.detail : `The message was not answered (${settled.reason}).`);
      }
    },
    // Closing the session (archive, shutdown) ends the wait, not the work: the turn resumes when it opens again.
    () => undefined
  );
}
