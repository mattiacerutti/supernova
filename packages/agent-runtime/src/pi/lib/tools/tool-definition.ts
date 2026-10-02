import type {ImageContent, Model, TextContent, TSchema} from "@earendil-works/pi-ai";
import type {AgentToolResult, ExtensionToolContext, ModelRuntime, ToolDefinition} from "@earendil-works/pi-coding-agent";
import type {JsonValue} from "@earendil-works/chord";
import type {ToolExecutionApi, ToolRegistration} from "@earendil-works/pi-durable";

/**
 * A context whose every unlisted property throws on access. Extensions written for the old SDK read `ctx` freely;
 * a capability Supernova lacks must fail loudly at the call that needs it, never silently no-op.
 */
export function strictContext<T extends object>(name: string, known: Partial<T>): T {
  return new Proxy(known as T, {
    get(target, property, receiver) {
      if (typeof property === "symbol" || property in target || property === "then") return Reflect.get(target, property, receiver);
      throw new Error(`${name}.${String(property)} is not supported in Supernova.`);
    },
  });
}

/** `ctx.ui` with no UI: Supernova never bound one, so every call is an explicit failure instead of the old no-op. */
const unsupportedUi = strictContext<ExtensionToolContext["ui"]>("ctx.ui", {});

/** The old-SDK tool context, built from what the engine call knows. */
async function toolContext(api: ToolExecutionApi, modelRuntime: ModelRuntime, signal: AbortSignal | undefined): Promise<ExtensionToolContext> {
  const agent = await api.agent({abortSignal: signal} as never);
  const model: Model<never> | undefined = agent.model ? (modelRuntime.getModel(agent.model.provider, agent.model.modelId) as Model<never> | undefined) : undefined;
  return strictContext<ExtensionToolContext>("ctx", {
    cwd: api.env?.cwd ?? agent.cwd ?? process.cwd(),
    hasUI: false,
    mode: "print",
    model,
    signal,
    thinkingLevel: agent.thinkingLevel,
    ui: unsupportedUi,
  } as Partial<ExtensionToolContext>);
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
