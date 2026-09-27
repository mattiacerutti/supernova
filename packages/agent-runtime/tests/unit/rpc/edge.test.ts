import {Effect} from "effect";
import {describe, expect, it} from "vitest";
import {oneOf, run} from "@supernova/agent-runtime/rpc/edge";

class DeclaredError extends Error {
  readonly _tag = "DeclaredError";
}

class OtherDeclaredError extends Error {
  readonly _tag = "OtherDeclaredError";
}

class FallbackError extends Error {
  readonly _tag = "FallbackError";
  constructor(cause: unknown) {
    super("fallback", {cause});
  }
}

const isDeclared = oneOf(DeclaredError, OtherDeclaredError, FallbackError);
const fallback = (cause: unknown) => new FallbackError(cause);

describe("rpc edge", () => {
  it("passes a declared error through unchanged", async () => {
    const thrown = new OtherDeclaredError("nope");
    const result = await Effect.runPromise(Effect.result(run(() => Promise.reject(thrown), isDeclared, fallback)));
    expect(result._tag === "Failure" && result.failure).toBe(thrown);
  });

  it("wraps anything else in the procedure's fallback error, keeping the cause", async () => {
    const thrown = new Error("resources unavailable");
    const result = await Effect.runPromise(Effect.result(run(() => Promise.reject(thrown), isDeclared, fallback)));
    expect(result._tag === "Failure" && result.failure).toMatchObject({_tag: "FallbackError", cause: thrown});
  });

  it("returns the resolved value", async () => {
    await expect(Effect.runPromise(run(() => Promise.resolve(42), isDeclared, fallback))).resolves.toBe(42);
  });
});
