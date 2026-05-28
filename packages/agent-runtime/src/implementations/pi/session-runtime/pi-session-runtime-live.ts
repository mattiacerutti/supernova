import {Effect, Layer, Stream} from "effect";
import type {SessionStreamEvent} from "@supernova/contracts/sessions/procedures";
import {PiModelCatalog, PiModelCatalogLive} from "@supernova/agent-runtime/implementations/pi/shared/internal/pi-model-catalog";
import {PiResourceCatalog, PiResourceCatalogLive} from "@supernova/agent-runtime/implementations/pi/shared/internal/pi-resource-catalog";
import {PiSessionStore, PiSessionStoreLive} from "@supernova/agent-runtime/implementations/pi/shared/internal/pi-session-store";
import {PiAgentSessionFactory, PiAgentSessionFactoryLive} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/pi-agent-session-factory";
import {PiSessionTitleGenerator, PiSessionTitleGeneratorLive} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/pi-session-title-generator";
import {SessionEventBus, SessionEventBusLive} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/session-event-bus";
import {SessionRuntimePool} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/session-runtime-pool";
import {SessionRuntimeService} from "@supernova/agent-runtime/services/session-runtime/session-runtime-service";

export const PiSessionRuntimeFromInternal = Layer.effect(
  SessionRuntimeService,
  Effect.gen(function* () {
    const agentSessionFactory = yield* PiAgentSessionFactory;
    const eventBus = yield* SessionEventBus;
    const modelCatalog = yield* PiModelCatalog;
    const resourceCatalog = yield* PiResourceCatalog;
    const sessionStore = yield* PiSessionStore;
    const titleGenerator = yield* PiSessionTitleGenerator;
    const pool = new SessionRuntimePool({agentSessionFactory, eventBus, modelCatalog, resourceCatalog, sessionStore, titleGenerator});

    return {
      abortSession: (sessionId: string) => Effect.promise(() => pool.abortSession(sessionId)),
      compactSession: (input) => Effect.promise(() => pool.compactSession(input)),
      sendMessage: (input) => Effect.promise(() => pool.sendMessage(input)),
      watchEvents: () => Stream.concat(Stream.make({type: "connected"} satisfies SessionStreamEvent), eventBus.stream()),
    };
  })
);

export const PiSessionRuntimeInternalLive = Layer.mergeAll(
  PiSessionStoreLive,
  PiAgentSessionFactoryLive,
  PiModelCatalogLive,
  PiResourceCatalogLive,
  PiSessionTitleGeneratorLive,
  SessionEventBusLive
);

export const PiSessionRuntimeLive = PiSessionRuntimeFromInternal.pipe(Layer.provide(PiSessionRuntimeInternalLive));
