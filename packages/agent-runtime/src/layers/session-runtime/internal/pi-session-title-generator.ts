import {Context, Effect, Layer} from "effect";
import type {UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {PiSdkService} from "@supernova/agent-runtime/layers/pi-sdk";
import type {PiModel} from "@supernova/agent-runtime/layers/shared/internal/pi-model-catalog";
import {sessionTitleContext, sessionTitleMaxTokens, titleFromResponse} from "@supernova/agent-runtime/layers/session-runtime/lib/session-title-generator";

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
        const response = await piSdk.modelRuntime.completeSimple(model, sessionTitleContext({contentParts}), {
          maxTokens: sessionTitleMaxTokens,
        });

        return titleFromResponse(response);
      },
    };
  })
);
