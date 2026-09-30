import {describe, expect, it} from "vitest";
import {Workflow} from "@supernova/agent-runtime/lib/workflow";

describe("Workflow", () => {
  it("undoes completed steps newest-first when a required step fails", async () => {
    const log: string[] = [];
    const workflow = new Workflow();

    await workflow.step({name: "a", required: true, run: async () => ({value: 1, undo: async () => void log.push("undo a")})});
    await workflow.step({name: "b", required: true, run: async () => ({value: 2, undo: async () => void log.push("undo b")})});
    await expect(
      workflow.step({
        name: "c",
        required: true,
        run: async () => {
          throw new Error("boom");
        },
      })
    ).rejects.toThrow("boom");

    expect(log).toEqual(["undo b", "undo a"]);
  });

  it("skips an optional step that fails and keeps going", async () => {
    const log: string[] = [];
    const workflow = new Workflow();

    await workflow.step({name: "a", required: true, run: async () => ({value: 1, undo: async () => void log.push("undo a")})});
    const optional = await workflow.step({
      name: "b",
      required: false,
      run: async () => {
        throw new Error("nope");
      },
    });
    const value = await workflow.step({name: "c", required: true, run: async () => ({value: "done"})});

    expect(optional).toBeUndefined();
    expect(value).toBe("done");
    expect(log).toEqual([]);
  });

  it("surfaces the original failure even when an undo throws", async () => {
    const workflow = new Workflow();
    await workflow.step({
      name: "a",
      required: true,
      run: async () => ({
        value: 1,
        undo: async () => {
          throw new Error("undo failed");
        },
      }),
    });

    await expect(
      workflow.step({
        name: "b",
        required: true,
        run: async () => {
          throw new Error("original");
        },
      })
    ).rejects.toThrow("original");
  });
});
