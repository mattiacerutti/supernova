import type {PiSessionRuntime} from "@supernova/agent-runtime/layers/session-runtime/internal/pi-session-runtime";

/** Aborts provider work on a retained runtime if one exists. */
export async function abortSession(runtime: PiSessionRuntime | undefined): Promise<void> {
  await runtime?.abort();
}
