import {Effect, Layer, Stream} from "effect";
import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import {PiModelCatalog, PiModelCatalogLive} from "@supernova/agent-runtime/layers/shared/internal/pi-model-catalog";
import {PiResourceCatalog, PiResourceCatalogLive} from "@supernova/agent-runtime/layers/shared/internal/pi-resource-catalog";
import {PiSessionStore, PiSessionStoreLive} from "@supernova/agent-runtime/layers/shared/internal/pi-session-store";
import {PiAgentSessionFactory, PiAgentSessionFactoryLive} from "@supernova/agent-runtime/layers/session-runtime/internal/pi-agent-session-factory";
import {PiSessionTitleGenerator, PiSessionTitleGeneratorLive} from "@supernova/agent-runtime/layers/session-runtime/internal/pi-session-title-generator";
import {CheckpointStore, CheckpointStoreLive} from "@supernova/agent-runtime/layers/session-runtime/internal/checkpoint-store";
import {SessionEventBus, SessionEventBusLive} from "@supernova/agent-runtime/layers/session-runtime/internal/session-event-bus";
import {asCheckpointNavigationError} from "@supernova/agent-runtime/layers/session-runtime/lib/checkpoints/checkpoint-navigation-error";
import {SessionRuntimePool} from "@supernova/agent-runtime/layers/session-runtime/internal/session-runtime-pool";
import {SessionRuntimeService} from "@supernova/agent-runtime/services/session-runtime-service";

export const PiSessionRuntimeFromInternal = Layer.effect(
  SessionRuntimeService,
  Effect.gen(function* () {
    const agentSessionFactory = yield* PiAgentSessionFactory;
    const checkpointStore = yield* CheckpointStore;
    const eventBus = yield* SessionEventBus;
    const modelCatalog = yield* PiModelCatalog;
    const resourceCatalog = yield* PiResourceCatalog;
    const sessionStore = yield* PiSessionStore;
    const titleGenerator = yield* PiSessionTitleGenerator;
    const pool = new SessionRuntimePool({agentSessionFactory, checkpointStore, eventBus, modelCatalog, resourceCatalog, sessionStore}, titleGenerator);
    yield* Effect.addFinalizer(() => Effect.promise(() => pool.dispose()));

    return {
      abortSession: (sessionId: string) => Effect.promise(() => pool.abortSession(sessionId)),
      compactSession: (input) => Effect.promise(() => pool.compactSession(input)),
      deleteSessionCheckpoints: (projectRoot, sessionId) => Effect.promise(() => pool.deleteSessionCheckpoints(projectRoot, sessionId)),
      getCommittedSession: (sessionId) => Effect.sync(() => pool.getCommittedSession(sessionId)),
      redoCheckpoint: (input) => Effect.tryPromise({try: () => pool.redoCheckpoint(input), catch: asCheckpointNavigationError}),
      releaseSession: (sessionId) => Effect.promise(() => pool.releaseSession(sessionId)),
      revertToMessage: (input) => Effect.tryPromise({try: () => pool.revertToMessage(input), catch: asCheckpointNavigationError}),
      sendMessage: (input) => Effect.promise(() => pool.sendMessage(input)),
      undoCheckpoint: (input) => Effect.tryPromise({try: () => pool.undoCheckpoint(input), catch: asCheckpointNavigationError}),
      watchEvents: () => Stream.concat(Stream.make({type: "connected"} satisfies SessionStreamEvent), eventBus.stream()),
    };
  })
);

const PiSessionRuntimeInternalLive = Layer.mergeAll(
  PiSessionStoreLive,
  PiAgentSessionFactoryLive,
  PiModelCatalogLive,
  PiResourceCatalogLive,
  PiSessionTitleGeneratorLive,
  CheckpointStoreLive,
  SessionEventBusLive
);

export const PiSessionRuntimeLive = PiSessionRuntimeFromInternal.pipe(Layer.provide(PiSessionRuntimeInternalLive));
