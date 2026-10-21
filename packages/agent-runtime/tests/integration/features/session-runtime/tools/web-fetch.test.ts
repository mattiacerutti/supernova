import {createServer} from "node:http";
import type {Server} from "node:http";
import type {AddressInfo} from "node:net";
import type {ToolResultMessage} from "@supernova/contracts/services/sessions/schemas";
import {afterEach, describe, expect, it} from "vitest";
import {createPiTestRuntime, fauxAssistantMessage, fauxToolCall, selectedModelReference} from "@tests/support/session-runtime";

async function serve(
  routes: Record<string, {readonly body: string; readonly type: string}>
): Promise<{readonly url: (path: string) => string; readonly close: () => Promise<void>}> {
  const server: Server = createServer((request, response) => {
    const route = routes[request.url ?? ""];
    if (!route) return void response.writeHead(404).end();
    response.writeHead(200, {"content-type": route.type}).end(route.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const {port} = server.address() as AddressInfo;
  return {url: (path) => `http://127.0.0.1:${port}${path}`, close: () => new Promise((resolve) => server.close(() => resolve()))};
}

describe("the web_fetch tool in a turn", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()!();
  });

  async function fetchInTurn(args: Parameters<typeof fauxToolCall>[1]): Promise<ToolResultMessage> {
    const pi = await createPiTestRuntime();
    cleanups.push(() => pi.unregister());
    const {info} = await pi.createSession();
    pi.faux.setResponses([fauxAssistantMessage(fauxToolCall("web_fetch", args), {stopReason: "toolUse"}), fauxAssistantMessage("Read it.")]);

    const {session} = await pi.sendMessage({message: "Read the page", modelReference: selectedModelReference, sessionId: info.id});

    const result = session.entries.items.find((entry) => entry.kind === "pi.tool-result")?.model?.[0];
    expect(result?.role).toBe("toolResult");
    return result as ToolResultMessage;
  }

  it("gives the model a page as markdown by default, without its scripts", async () => {
    const site = await serve({"/page": {body: "<h1>Hello</h1><p>world</p><script>bad()</script>", type: "text/html; charset=utf-8"}});
    cleanups.push(site.close);

    const result = await fetchInTurn({url: site.url("/page")});

    expect(result).toMatchObject({isError: false, toolName: "web_fetch", content: [{text: "# Hello\n\nworld", type: "text"}]});
    expect(result.details).toEqual({contentType: "text/html; charset=utf-8", format: "markdown", output: "# Hello\n\nworld", url: site.url("/page")});
  });

  it("reports a refused URL to the model as a tool error, and the turn still completes", async () => {
    const result = await fetchInTurn({url: "file:///etc/passwd"});

    expect(result).toMatchObject({isError: true, toolName: "web_fetch"});
    expect(JSON.stringify(result.content)).toContain("URL must use http:// or https://");
  });
});
