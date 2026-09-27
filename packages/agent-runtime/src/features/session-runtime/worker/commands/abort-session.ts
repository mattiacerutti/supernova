import type {SessionWorker} from "@supernova/agent-runtime/features/session-runtime/worker/session-worker";

/** Aborts provider work on a retained runtime if one exists. */
export async function abortSession(runtime: SessionWorker | undefined): Promise<void> {
  await runtime?.abort();
}
