import {createServer} from "node:http";
import type {Server} from "node:http";
import {afterEach, describe, expect, it} from "vitest";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {SupernovaTools, webFetchTool} from "@supernova/agent-runtime/features/session-runtime/tools/web-fetch";

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

describe("web fetch tool", () => {
  it("returns fetched content as text content and structured details", async () => {
    const url = await listenWithTextResponse("hello");
    const result = await webFetchTool.execute({format: "text", url}, {} as never, BACKGROUND_CONTEXT);

    expect(result).toEqual({
      output: [{text: "hello", type: "text"}],
      details: {contentType: "text/plain", format: "text", output: "hello", url},
    });
  });

  it("is offered as Supernova's own extension, carrying its prompt text", () => {
    expect(SupernovaTools.tools?.map((tool) => tool.name)).toEqual(["web_fetch"]);
    expect(webFetchTool.prompt?.snippet).toContain("web_fetch");
  });
});
