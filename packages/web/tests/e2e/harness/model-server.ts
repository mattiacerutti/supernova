import {createServer} from "node:http";
import type {IncomingMessage, ServerResponse} from "node:http";
import type {AddressInfo} from "node:net";

interface ChatMessage {
  readonly role: string;
  readonly content: string | readonly {readonly text?: string}[] | null;
}

export interface ModelRequest {
  readonly messages: readonly ChatMessage[];
  /** The latest user message: what the user sent, as the runtime built it. */
  readonly prompt: string;
  readonly toolResults: readonly string[];
}

type ToolCall = {readonly name: string; readonly arguments: Readonly<Record<string, unknown>>};
type Step = {readonly text: string} | ToolCall;
type Turn =
  | {readonly type: "answer"; readonly steps: readonly Step[]}
  | {readonly type: "error"; readonly status: number; readonly message: string}
  | {readonly type: "hold"; readonly before: string; readonly after: string; readonly started: () => void; readonly released: Promise<void>};

const TITLE_SYSTEM_PROMPT = "Generate a concise title for this coding session";

function text(content: ChatMessage["content"]): string {
  return typeof content === "string" ? content : (content ?? []).map((part) => part.text ?? "").join("");
}

function stream(response: ServerResponse, steps: readonly Step[]): void {
  const chunk = (payload: object) => response.write(`data: ${JSON.stringify({object: "chat.completion.chunk", ...payload})}\n\n`);
  if (!response.headersSent) response.writeHead(200, {"content-type": "text/event-stream"});
  const calls = steps.filter((step): step is ToolCall => "name" in step);
  for (const step of steps) {
    const delta =
      "name" in step
        ? {tool_calls: [{index: calls.indexOf(step), id: `call_${calls.indexOf(step)}`, type: "function", function: {name: step.name, arguments: JSON.stringify(step.arguments)}}]}
        : {content: step.text};
    chunk({choices: [{index: 0, delta, finish_reason: null}]});
  }
}

function finish(response: ServerResponse, toolUse: boolean): void {
  const chunk = (payload: object) => response.write(`data: ${JSON.stringify({object: "chat.completion.chunk", ...payload})}\n\n`);
  chunk({choices: [{index: 0, delta: {}, finish_reason: toolUse ? "tool_calls" : "stop"}]});
  chunk({choices: [], usage: {prompt_tokens: 10, completion_tokens: 5, total_tokens: 15}});
  response.end("data: [DONE]\n\n");
}

/** Unscripted requests fail the test. Title requests are answered with `title` and kept out of `requests`. */
export class ScriptedModel {
  public static readonly title = "Scripted session";

  public readonly requests: ModelRequest[] = [];
  private readonly turns: Turn[] = [];
  private readonly failures: string[] = [];
  private readonly server = createServer((request, response) => void this.handle(request, response));

  public static async start(): Promise<ScriptedModel> {
    const model = new ScriptedModel();
    await new Promise<void>((resolve) => model.server.listen(0, "127.0.0.1", resolve));
    return model;
  }

  public get baseUrl(): string {
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/v1`;
  }

  public reply(answer: string): this {
    this.turns.push({type: "answer", steps: [{text: answer}]});
    return this;
  }

  public useTools(calls: readonly ToolCall[], answer: string): this {
    this.turns.push({type: "answer", steps: calls});
    return this.reply(answer);
  }

  public fail(message: string, status: number): this {
    this.turns.push({type: "error", status, message});
    return this;
  }

  /** Streams `before` on the next request, then waits for `release()`; a stop from the client ends it. */
  public hold(script: {readonly before?: string; readonly after?: string} = {}): {readonly started: Promise<void>; release(): void} {
    let started!: () => void;
    let release!: () => void;
    const startedPromise = new Promise<void>((resolve) => (started = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    this.turns.push({type: "hold", before: script.before ?? "", after: script.after ?? "Done.", started, released});
    return {started: startedPromise, release};
  }

  /** Returns why the test should fail: unscripted requests, or scripted turns never requested. */
  public reset(): readonly string[] {
    const problems = [...this.failures, ...this.turns.map((turn) => `A scripted ${turn.type} was never requested.`)];
    this.turns.length = 0;
    this.requests.length = 0;
    this.failures.length = 0;
    return problems;
  }

  public async close(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private async handle(incoming: IncomingMessage, response: ServerResponse): Promise<void> {
    let body = "";
    for await (const chunk of incoming) body += chunk;
    const messages: readonly ChatMessage[] = JSON.parse(body).messages ?? [];
    if (messages.some((message) => message.role !== "user" && text(message.content).startsWith(TITLE_SYSTEM_PROMPT))) {
      stream(response, [{text: ScriptedModel.title}]);
      return finish(response, false);
    }

    const lastUser = messages.findLastIndex((message) => message.role === "user");
    const request = {
      messages,
      prompt: text(messages[lastUser]?.content ?? ""),
      toolResults: messages.slice(lastUser + 1).flatMap((message) => (message.role === "tool" ? [text(message.content)] : [])),
    };
    this.requests.push(request);
    const turn = this.turns.shift();
    if (!turn || turn.type === "error") {
      const message = turn?.message ?? `The model received a request no test scripted: ${JSON.stringify(request.prompt)}.`;
      if (!turn) this.failures.push(message);
      response.writeHead(turn?.status ?? 500, {"content-type": "application/json"}).end(JSON.stringify({error: {message}}));
      return;
    }
    if (turn.type === "answer") {
      stream(response, turn.steps);
      return finish(
        response,
        turn.steps.some((step) => "name" in step)
      );
    }

    stream(response, turn.before ? [{text: turn.before}] : []);
    turn.started();
    await Promise.race([turn.released, new Promise((resolve) => response.once("close", resolve))]);
    if (response.destroyed) return;
    stream(response, [{text: turn.after}]);
    finish(response, false);
  }
}
