import {Effect, Layer} from "effect";
import {SessionsService} from "@supernova/agent-runtime/services/sessions-service";
import {PiModelCatalog, PiModelCatalogLive} from "@supernova/agent-runtime/layers/shared/internal/pi-model-catalog";
import {PiResourceCatalog, PiResourceCatalogLive} from "@supernova/agent-runtime/layers/shared/internal/pi-resource-catalog";
import {PiSessionStore, PiSessionStoreLive} from "@supernova/agent-runtime/layers/shared/internal/pi-session-store";
import {createSession} from "@supernova/agent-runtime/layers/sessions/operations/create-session";
import {getSession} from "@supernova/agent-runtime/layers/sessions/operations/get-session";
import {listComposerSuggestions} from "@supernova/agent-runtime/layers/sessions/operations/list-composer-suggestions";
import {listModels} from "@supernova/agent-runtime/layers/sessions/operations/list-models";

export const PiSessionsFromInternal = Layer.effect(
  SessionsService,
  Effect.gen(function* () {
    const modelCatalog = yield* PiModelCatalog;
    const resourceCatalog = yield* PiResourceCatalog;
    const sessionStore = yield* PiSessionStore;

    return {
      create: (projectPath) => createSession(projectPath).pipe(Effect.provideService(PiSessionStore, sessionStore)),
      get: (sessionId) => getSession(sessionId).pipe(Effect.provideService(PiSessionStore, sessionStore)),
      listComposerSuggestions: (projectPath, kind, query) => listComposerSuggestions(projectPath, kind, query).pipe(Effect.provideService(PiResourceCatalog, resourceCatalog)),
      listModels: () => listModels().pipe(Effect.provideService(PiModelCatalog, modelCatalog)),
    };
  })
);

export const PiSessionsInternalLive = Layer.mergeAll(PiSessionStoreLive, PiModelCatalogLive, PiResourceCatalogLive);

export const PiSessionsLive = PiSessionsFromInternal.pipe(Layer.provide(PiSessionsInternalLive));
