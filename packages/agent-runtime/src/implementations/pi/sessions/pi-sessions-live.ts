import {Effect, Layer} from "effect";
import {SessionsService} from "@supernova/agent-runtime/services/sessions/sessions-service";
import {PiAgentSessionFactoryLive} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-agent-session-factory";
import {PiModelCatalog, PiModelCatalogLive} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-model-catalog";
import {PiResourceCatalog, PiResourceCatalogLive} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-resource-catalog";
import {PiSessionStore, PiSessionStoreLive} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-session-store";
import {PiSessionTitleGeneratorLive} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-session-title-generator";
import {SessionEventBusLive} from "@supernova/agent-runtime/implementations/pi/sessions/internal/session-event-bus";
import {SessionRuntimeManager, SessionRuntimeManagerLive} from "@supernova/agent-runtime/implementations/pi/sessions/internal/session-runtime-manager";
import {createSession} from "@supernova/agent-runtime/implementations/pi/sessions/operations/create-session";
import {getSession} from "@supernova/agent-runtime/implementations/pi/sessions/operations/get-session";
import {listComposerSuggestions} from "@supernova/agent-runtime/implementations/pi/sessions/operations/list-composer-suggestions";
import {listModels} from "@supernova/agent-runtime/implementations/pi/sessions/operations/list-models";

export const PiSessionsFromInternal = Layer.effect(
  SessionsService,
  Effect.gen(function* () {
    const modelCatalog = yield* PiModelCatalog;
    const resourceCatalog = yield* PiResourceCatalog;
    const sessionStore = yield* PiSessionStore;
    const runtimeManager = yield* SessionRuntimeManager;

    return {
      abortSession: (sessionId) => runtimeManager.abortSession(sessionId),
      create: (projectPath) => createSession(projectPath).pipe(Effect.provideService(PiSessionStore, sessionStore)),
      get: (sessionId) => getSession(sessionId).pipe(Effect.provideService(PiSessionStore, sessionStore)),
      listComposerSuggestions: (projectPath, kind, query) => listComposerSuggestions(projectPath, kind, query).pipe(Effect.provideService(PiResourceCatalog, resourceCatalog)),
      listModels: () => listModels().pipe(Effect.provideService(PiModelCatalog, modelCatalog)),
      sendMessage: (input) => runtimeManager.sendMessage(input),
      watchEvents: () => runtimeManager.watchEvents(),
    };
  })
);

const PiSessionsInternalLive = Layer.mergeAll(PiSessionStoreLive, PiAgentSessionFactoryLive, PiModelCatalogLive, PiResourceCatalogLive, PiSessionTitleGeneratorLive);
const PiSessionRuntimeLive = SessionRuntimeManagerLive.pipe(Layer.provide(Layer.mergeAll(PiSessionsInternalLive, SessionEventBusLive)));

export const PiSessionsLive = PiSessionsFromInternal.pipe(Layer.provide(Layer.mergeAll(PiSessionsInternalLive, SessionEventBusLive, PiSessionRuntimeLive)));
