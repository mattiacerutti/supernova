import {Effect, Layer, Stream} from "effect";
import {SessionsService} from "@supernova/agent-runtime/services/sessions/sessions-service";
import {PiAgentSessionFactory, PiAgentSessionFactoryLive} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-agent-session-factory";
import {PiModelCatalog, PiModelCatalogLive} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-model-catalog";
import {PiResourceCatalog, PiResourceCatalogLive} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-resource-catalog";
import {PiSessionStore, PiSessionStoreLive} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-session-store";
import {PiSessionTitleGenerator, PiSessionTitleGeneratorLive} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-session-title-generator";
import {createSession} from "@supernova/agent-runtime/implementations/pi/sessions/operations/create-session";
import {getSession} from "@supernova/agent-runtime/implementations/pi/sessions/operations/get-session";
import {listComposerSuggestions} from "@supernova/agent-runtime/implementations/pi/sessions/operations/list-composer-suggestions";
import {listModels} from "@supernova/agent-runtime/implementations/pi/sessions/operations/list-models";
import {sendMessage} from "@supernova/agent-runtime/implementations/pi/sessions/operations/send-message";

export const PiSessionsFromInternal = Layer.effect(
  SessionsService,
  Effect.gen(function* () {
    const agentSessionFactory = yield* PiAgentSessionFactory;
    const modelCatalog = yield* PiModelCatalog;
    const resourceCatalog = yield* PiResourceCatalog;
    const sessionStore = yield* PiSessionStore;
    const titleGenerator = yield* PiSessionTitleGenerator;

    return {
      create: (projectPath) => createSession(projectPath).pipe(Effect.provideService(PiSessionStore, sessionStore)),
      get: (sessionId) => getSession(sessionId).pipe(Effect.provideService(PiSessionStore, sessionStore)),
      listComposerSuggestions: (projectPath, kind, query) => listComposerSuggestions(projectPath, kind, query).pipe(Effect.provideService(PiResourceCatalog, resourceCatalog)),
      listModels: () => listModels().pipe(Effect.provideService(PiModelCatalog, modelCatalog)),
      sendMessage: (input) =>
        sendMessage(input).pipe(
          Stream.provideService(PiAgentSessionFactory, agentSessionFactory),
          Stream.provideService(PiModelCatalog, modelCatalog),
          Stream.provideService(PiResourceCatalog, resourceCatalog),
          Stream.provideService(PiSessionStore, sessionStore),
          Stream.provideService(PiSessionTitleGenerator, titleGenerator)
        ),
    };
  })
);

export const PiSessionsLive = PiSessionsFromInternal.pipe(
  Layer.provide(Layer.mergeAll(PiSessionStoreLive, PiAgentSessionFactoryLive, PiModelCatalogLive, PiResourceCatalogLive, PiSessionTitleGeneratorLive))
);
