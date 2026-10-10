import type {ImageContent, Model, TextContent, TSchema} from "@earendil-works/pi-ai";
import type {AgentToolResult, ExtensionToolContext, ModelRuntime, ToolDefinition} from "@earendil-works/pi-coding-agent";
import type {JsonValue} from "@earendil-works/chord";
import type {ToolExecutionApi, ToolRegistration} from "@earendil-works/pi-durable";
import {extensionContext} from "@supernova/agent-runtime/pi/extensions/legacy/extension-context";

/** The old-SDK tool context, built from what the engine call knows; `executeTool` and `tools` are not available. */
async function toolContext(api: ToolExecutionApi, modelRuntime: ModelRuntime, signal: AbortSignal | undefined): Promise<ExtensionToolContext> {
  const agent = await api.agent({abortSignal: signal} as never);
  const model = agent.model ? (modelRuntime.getModel(agent.model.provider, agent.model.modelId) as Model<never> | undefined) : undefined;
  const ctx = extensionContext({cwd: api.env?.cwd ?? agent.cwd ?? process.cwd(), model, modelRuntime, signal, thinkingLevel: agent.thinkingLevel});
  // Assigned rather than spread: a spread would read the members that throw when the engine has no equivalent.
  return Object.assign(ctx, {
    tools: [],
    executeTool: () => {
      throw new Error("ctx.executeTool is not available in Supernova.");
    },
  }) as ExtensionToolContext;
}

function toJson(value: unknown): JsonValue | undefined {
  const json = JSON.stringify(value);
  return json === undefined ? undefined : (JSON.parse(json) as JsonValue);
}

/**
 * Runs an old-SDK `ToolDefinition` as an engine tool: the same name, description, and schema; streamed partial
 * results become running output and details. Used for Supernova's own tools and extension-registered ones.
 */
export function fromToolDefinition(definition: ToolDefinition<TSchema, unknown>, modelRuntime: ModelRuntime): ToolRegistration {
  return {
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
    ...(definition.executionMode ? {executionMode: definition.executionMode} : {}),
    ...(definition.prepareArguments ? {prepareArguments: definition.prepareArguments} : {}),
    async execute(args, api, context) {
      const signal = context.abortSignal;
      let streamed = "";
      const result: AgentToolResult<unknown> = await definition.execute(
        api.callId,
        args,
        signal,
        (partial) => {
          const text = partial.content
            .filter((part): part is TextContent => part.type === "text")
            .map((part) => part.text)
            .join("");
          if (text.startsWith(streamed)) api.output(text.slice(streamed.length));
          streamed = text;
        },
        await toolContext(api, modelRuntime, signal)
      );
      const details = toJson(result.details);
      return {
        content: result.content as (TextContent | ImageContent)[],
        ...(details === undefined ? {} : {details}),
        ...(result.isError ? {isError: true} : {}),
        ...(result.usage ? {usage: result.usage} : {}),
        ...(result.terminate ? {control: {terminate: true}} : {}),
      };
    },
  };
}
