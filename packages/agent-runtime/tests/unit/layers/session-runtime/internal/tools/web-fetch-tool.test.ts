import {createServer} from "node:http";
import type {Server} from "node:http";
import {afterEach, describe, expect, it} from "vitest";
import {createPiCustomTools} from "@supernova/agent-runtime/layers/session-runtime/internal/tools/create-pi-custom-tools";
import {createWebFetchTool} from "@supernova/agent-runtime/layers/session-runtime/internal/tools/web-fetch-tool";

let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }
    server.close((error) => (error ? reject(error) : resolve()));
  });
  server = undefined;
});

function listenWithTextResponse(text: string): Promise<string> {
  server = createServer((_request, response) => {
    response.writeHead(200, {"content-type": "text/plain"});
    response.end(text);
  });

  return new Promise((resolve, reject) => {
    server?.once("error", reject);
    server?.listen(0, "127.0.0.1", () => {
      const address = server?.address();
      if (!address || typeof address === "string") {
        reject(new Error("HTTP test server address was unavailable"));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}/`);
    });
  });
}

describe("Pi web fetch custom tool", () => {
  it("returns fetched content as text content and structured details", async () => {
    const url = await listenWithTextResponse("hello");
    const tool = createWebFetchTool();
    const result = await tool.execute("call-1", {format: "text", url}, undefined, undefined, {} as Parameters<typeof tool.execute>[4]);

    expect(result).toEqual({
      content: [{text: "hello", type: "text"}],
      details: {contentType: "text/plain", format: "text", output: "hello", url},
    });
  });

  it("composes Supernova custom Pi tools", () => {
    expect(createPiCustomTools()).toEqual([expect.objectContaining({label: "Web Fetch", name: "web_fetch"})]);
  });
});
