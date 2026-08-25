import {describe, expect, it} from "vitest";
import {KeyedMutex} from "@supernova/agent-runtime/layers/shared/lib/keyed-mutex";

function deferred(): {readonly promise: Promise<void>; readonly resolve: () => void} {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = () => complete();
  });
  return {promise, resolve};
}

describe("keyed mutex", () => {
  it("runs work for the same key one at a time", async () => {
    const locks = new KeyedMutex<string>();
    const first = deferred();
    const events: string[] = [];

    const blocked = locks.withLock("project", async () => {
      events.push("first-start");
      await first.promise;
      events.push("first-end");
    });
    const queued = locks.withLock("project", async () => {
      events.push("second-start");
    });

    await Promise.resolve();
    expect(events).toEqual(["first-start"]);

    first.resolve();
    await Promise.all([blocked, queued]);
    expect(events).toEqual(["first-start", "first-end", "second-start"]);
  });

  it("runs work for different keys concurrently", async () => {
    const locks = new KeyedMutex<string>();
    const blocker = deferred();
    const events: string[] = [];

    const blocked = locks.withLock("project-a", async () => {
      events.push("a-start");
      await blocker.promise;
      events.push("a-end");
    });
    await locks.withLock("project-b", async () => {
      events.push("b-done");
    });

    expect(events).toEqual(["a-start", "b-done"]);
    blocker.resolve();
    await blocked;
    expect(events).toEqual(["a-start", "b-done", "a-end"]);
  });

  it("releases the key after failing work and propagates the failure", async () => {
    const locks = new KeyedMutex<string>();

    await expect(locks.withLock("project", () => Promise.reject(new Error("capture failed")))).rejects.toThrow("capture failed");
    await expect(locks.withLock("project", () => Promise.resolve("restored"))).resolves.toBe("restored");
  });

  it("returns the result of the queued work", async () => {
    const locks = new KeyedMutex<string>();
    const blocker = deferred();

    const blocked = locks.withLock("project", () => blocker.promise.then(() => "first"));
    const queued = locks.withLock("project", () => Promise.resolve("second"));

    blocker.resolve();
    await expect(blocked).resolves.toBe("first");
    await expect(queued).resolves.toBe("second");
  });
});
