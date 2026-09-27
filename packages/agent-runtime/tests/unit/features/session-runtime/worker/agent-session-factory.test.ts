import {describe, expect, it, vi} from "vitest";
import {createAgentSessionFactory} from "@supernova/agent-runtime/features/session-runtime/worker/agent-session-factory";
import type {PiSdk, PiSessionManager} from "@supernova/agent-runtime/pi/sdk";

describe("Pi agent session factory", () => {
  it("creates sessions with Supernova's custom resource loader policy", async () => {
    const resourceLoader = {reload: vi.fn(async () => undefined), getExtensions: () => ({errors: []})};
    const session = {
      getActiveToolNames: vi.fn(() => ["read", "bash", "edit", "write"]),
      setActiveToolsByName: vi.fn(),
    };
    const piSdk = {
      createAgentSession: vi.fn(async () => ({session})),
      createResourceLoader: vi.fn(() => resourceLoader),
      modelRuntime: {},
    } as unknown as PiSdk;
    const sessionManager = {} as PiSessionManager;

    const factory = createAgentSessionFactory(piSdk);
    await factory.createAgentSession({cwd: "/workspace", sessionManager});

    expect(piSdk.createResourceLoader).toHaveBeenCalledWith({projectPath: "/workspace"});
    expect(resourceLoader.reload).toHaveBeenCalledOnce();
    expect(piSdk.createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customTools: [expect.objectContaining({name: "web_fetch"})],
        modelRuntime: piSdk.modelRuntime,
        resourceLoader,
        sessionManager,
      })
    );
    expect(session.setActiveToolsByName).toHaveBeenCalledWith(["read", "bash", "edit", "write", "web_fetch"]);
  });
});
