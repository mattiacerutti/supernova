import {expect, test} from "@tests/e2e/harness/fixtures";
import {ScriptedModel} from "@tests/e2e/harness/model-server";

test.describe("a conversation", () => {
  test("streams the answer, titles the session, and survives a reload", async ({app, model}) => {
    model.reply("Here is the plan.");

    await app.composer.send("Plan the refactor");

    await expect(app.page).toHaveURL(/\/session\/(?!new)[^/?]+$/);
    await expect(app.timeline.text("Here is the plan.")).toBeVisible();
    await expect(app.sessionTitle()).toHaveText(ScriptedModel.title);
    await expect(app.sidebar.session(ScriptedModel.title)).toBeVisible();
    await expect(app.page.getByRole("button", {name: "Send message"})).toBeVisible();

    await app.reload();
    await app.timeline.expectExchange("Plan the refactor", "Here is the plan.");
  });

  test("sends the whole conversation to the model on the next turn", async ({app, model}) => {
    model.reply("First answer.").reply("Second answer.");

    await app.composer.send("First question");
    await expect(app.timeline.text("First answer.")).toBeVisible();
    await app.composer.send("Second question");
    await expect(app.timeline.text("Second answer.")).toBeVisible();

    const [, second] = model.requests;
    expect(second?.messages.filter((message) => message.role !== "system" && message.role !== "developer").map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(second?.prompt).toBe("Second question");
  });

  test("shows a stream as it arrives, once, while the user switches sessions and back", async ({app, model}) => {
    model.reply("Other answer.");
    await app.composer.send("Other session");
    await expect(app.timeline.text("Other answer.")).toBeVisible();
    await app.sidebar.rename(ScriptedModel.title, "Other");

    await app.page.getByRole("button", {exact: true, name: /^New session in /}).click();
    const held = model.hold({before: "Partial answer", after: " finished."});
    await app.composer.send("Long question");
    await held.started;
    await expect(app.timeline.text(/Partial answer/)).toBeVisible();

    await app.sidebar.open("Other");
    await app.sidebar.open(ScriptedModel.title);
    await expect(app.timeline.text("Long question")).toHaveCount(1);

    held.release();
    await expect(app.timeline.text("Partial answer finished.")).toBeVisible();
    await app.timeline.expectExchange("Long question");
  });

  test("reconnects to a running answer after a reload; the server owns it, not the page", async ({app, model}) => {
    const held = model.hold({before: "Started", after: " and completed."});
    await app.composer.send("Keep going");
    await held.started;

    await app.reload();
    await expect(app.page.getByRole("button", {name: "Stop streaming"})).toBeVisible();
    held.release();

    await expect(app.timeline.text("Started and completed.")).toBeVisible();
    await app.timeline.expectExchange("Keep going", "Started and completed.");
  });

  test("stops an answer and keeps what streamed, then takes the next message", async ({app, model}) => {
    const held = model.hold({before: "Half an answer"});
    await app.composer.send("Start something");
    await held.started;
    await expect(app.timeline.text(/Half an answer/)).toBeVisible();

    await app.composer.stop();
    model.reply("Fresh answer.");
    await app.composer.send("Something else");

    await expect(app.timeline.text("Fresh answer.")).toBeVisible();
    await app.timeline.expectExchange("Start something", "Something else");
  });

  test("shows a provider's error and takes the next message", async ({app, model}) => {
    // Not a retryable failure (rate limits and overload are retried), so it ends the turn at once.
    model.fail("Invalid API key for this model.", 401);
    await app.composer.send("Try this");

    await expect(app.timeline.text(/Invalid API key for this model\./)).toBeVisible();
    await expect(app.page.getByRole("button", {name: "Send message"})).toBeVisible();

    model.reply("Worked this time.");
    await app.composer.send("Try again");
    await expect(app.timeline.text("Worked this time.")).toBeVisible();
  });

  test("runs two sessions at once without mixing them", async ({app, model}) => {
    const first = model.hold({after: "Answer for A."});
    await app.composer.send("Question A");
    await first.started;
    await app.sidebar.rename(ScriptedModel.title, "Session A");

    await app.page.getByRole("button", {exact: true, name: /^New session in /}).click();
    model.reply("Answer for B.");
    await app.composer.send("Question B");
    await expect(app.timeline.text("Answer for B.")).toBeVisible();

    first.release();
    await app.sidebar.open("Session A");
    await expect(app.timeline.text("Answer for A.")).toBeVisible();
    await expect(app.timeline.text("Question B")).toHaveCount(0);
  });
});
