import {Context, Effect, Layer} from "effect";
import type {UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {PiSdkService} from "@supernova/agent-runtime/implementations/pi/pi-sdk";
import type {PiModel} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-model-catalog";
import {sessionTitleContext, sessionTitleMaxTokens, titleFromResponse} from "@supernova/agent-runtime/implementations/pi/sessions/lib/session-title-generator";

export interface PiSessionTitleGeneratorShape {
  readonly generateSessionTitle: (input: {readonly contentParts: readonly UserMessageContentPart[]; readonly model: PiModel}) => Promise<string>;
}

/** Private capability for generating user-facing Pi session titles. */
export class PiSessionTitleGenerator extends Context.Service<PiSessionTitleGenerator, PiSessionTitleGeneratorShape>()("supernova/agent-runtime/PiSessionTitleGenerator") {}

export const PiSessionTitleGeneratorLive = Layer.effect(
  PiSessionTitleGenerator,
  Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return {
      generateSessionTitle: async ({contentParts, model}) => {
        const requestAuth = await piSdk.modelRegistry.getApiKeyAndHeaders(model);
        if (!requestAuth.ok) throw new Error("Failed to get API key and headers for the model.");

        const response = await piSdk.completeSimple(model, sessionTitleContext({contentParts}), {
          apiKey: requestAuth.apiKey,
          headers: requestAuth.headers,
          maxTokens: sessionTitleMaxTokens,
        });

        return titleFromResponse(response);
      },
    };
  })
);
