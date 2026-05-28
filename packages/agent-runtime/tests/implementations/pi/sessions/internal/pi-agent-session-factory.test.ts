import {Effect, Layer} from "effect";
import {describe, expect, it, vi} from "vitest";
import {PiSdkService} from "@supernova/agent-runtime/implementations/pi/pi-sdk";
import type {PiSdkServiceShape} from "@supernova/agent-runtime/implementations/pi/pi-sdk";
import {PiAgentSessionFactory, PiAgentSessionFactoryLive} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/pi-agent-session-factory";

describe("Pi agent session factory", () => {
  it("creates sessions with Supernova's custom resource loader policy", async () => {
    const resourceLoader = {reload: vi.fn(async () => undefined)};
    const piSdk = {
      authStorage: {},
      createAgentSession: vi.fn(async () => ({session: {}})),
      createResourceLoader: vi.fn(() => resourceLoader),
      modelRegistry: {},
    } as unknown as PiSdkServiceShape;
    const sessionManager = {} as Parameters<Awaited<ReturnType<typeof runFactory>>["createAgentSession"]>[0]["sessionManager"];

    const factory = await runFactory(piSdk);
    await factory.createAgentSession({cwd: "/workspace", sessionManager});

    expect(piSdk.createResourceLoader).toHaveBeenCalledWith({projectPath: "/workspace"});
    expect(resourceLoader.reload).toHaveBeenCalledOnce();
    expect(piSdk.createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceLoader,
        sessionManager,
      })
    );
  });
});

function runFactory(piSdk: PiSdkServiceShape) {
  return Effect.runPromise(
    Effect.gen(function* () {
      return yield* PiAgentSessionFactory;
    }).pipe(Effect.provide(PiAgentSessionFactoryLive.pipe(Layer.provide(Layer.succeed(PiSdkService, piSdk)))))
  );
}
