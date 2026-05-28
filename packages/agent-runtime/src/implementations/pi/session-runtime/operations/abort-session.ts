import type {PiSessionRuntime} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/pi-session-runtime";

/** Aborts provider work and releases a retained runtime if one exists. */
export async function abortSession(runtime: PiSessionRuntime | undefined): Promise<void> {
  await runtime?.release({abort: true});
}
