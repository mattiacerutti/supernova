import type {ToolDefinition} from "@earendil-works/pi-coding-agent";
import {createWebFetchTool} from "@supernova/agent-runtime/layers/session-runtime/internal/tools/web-fetch-tool";

/** Creates Pi custom tools registered on every agent session. */
export function createPiCustomTools(): ToolDefinition[] {
  return [createWebFetchTool() as unknown as ToolDefinition];
}
