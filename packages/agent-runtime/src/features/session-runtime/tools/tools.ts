import type {TSchema} from "@earendil-works/pi-ai";
import type {ModelRuntime, ToolDefinition} from "@earendil-works/pi-coding-agent";
import type {PromptedTool} from "@supernova/agent-runtime/pi/lib/tools/coding-tools";
import {fromToolDefinition} from "@supernova/agent-runtime/pi/lib/tools/tool-definition";
import {createWebFetchTool} from "@supernova/agent-runtime/features/session-runtime/tools/web-fetch-tool";

/** Supernova's own tools, offered in every session after the coding tools. */
export function createSupernovaTools(modelRuntime: ModelRuntime): PromptedTool[] {
  const definition = createWebFetchTool() as unknown as ToolDefinition<TSchema, unknown>;
  return [{tool: fromToolDefinition(definition, modelRuntime), prompt: {snippet: definition.promptSnippet, guidelines: definition.promptGuidelines ?? []}}];
}
