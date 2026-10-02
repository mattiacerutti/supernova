import type {ImageContent, Message, TextContent, TSchema} from "@earendil-works/pi-ai";
import type {Extension as PiExtension, LoadExtensionsResult, ModelRuntime, ToolDefinition} from "@earendil-works/pi-coding-agent";
import type {Extension, HookRegistration} from "@earendil-works/pi-durable";
import {defineExtension, GenerationTask, hook, ToolTask} from "@earendil-works/pi-durable";
import {fromToolDefinition, strictContext} from "@supernova/agent-runtime/pi/lib/tools/tool-definition";
import type {PromptedTool} from "@supernova/agent-runtime/pi/lib/tools/coding-tools";

type Handler = (event: Record<string, unknown>, ctx: unknown) => unknown;

/**
 * Old-SDK events this bridge delivers, and what delivers them. Any other subscribed event is reported once as
 * unsupported: an extension must never believe it is hooked into something that never fires.
 */
const SUPPORTED_EVENTS = new Set(["tool_call", "tool_result", "context", "session_start", "session_shutdown"]);

/** Old-SDK registration surfaces Supernova has no UI or behavior for. */
const UNSUPPORTED_REGISTRATIONS = ["commands", "shortcuts", "flags", "messageRenderers"] as const;

/** The minimal context old-SDK handlers get; anything else they read throws. */
function handlerContext(cwd: string) {
  return strictContext("ctx", {cwd, hasUI: false, mode: "print", ui: strictContext("ctx.ui", {})} as Record<string, unknown>);
}

async function emit(handlers: readonly Handler[] | undefined, event: Record<string, unknown>, cwd: string): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const handler of handlers ?? []) results.push(await handler(event, handlerContext(cwd)));
  return results;
}

/** An extension's problems, reported once when it loads. */
export interface ExtensionDiagnostic {
  readonly extensionPath: string;
  readonly message: string;
}

/** What one loaded old-format extension becomes. */
export interface BridgedExtension {
  readonly extension: Extension;
  readonly tools: readonly PromptedTool[];
}

/** Converts one loaded extension: its tools to engine tools, its supported events to engine hooks. */
function bridgeExtension(
  source: PiExtension,
  input: {readonly cwd: string; readonly modelRuntime: ModelRuntime},
  report: (diagnostic: ExtensionDiagnostic) => void
): BridgedExtension {
  const {cwd, modelRuntime} = input;
  const handlers = source.handlers as Map<string, Handler[]>;
  for (const event of handlers.keys()) {
    if (!SUPPORTED_EVENTS.has(event)) report({extensionPath: source.path, message: `subscribes to "${event}", which Supernova does not deliver.`});
  }
  for (const registration of UNSUPPORTED_REGISTRATIONS) {
    const registered = source[registration] as Map<string, unknown> | undefined;
    if (registered && registered.size > 0)
      report({extensionPath: source.path, message: `registers ${registration} (${[...registered.keys()].join(", ")}), which Supernova does not support.`});
  }

  const tools = [...source.tools.values()].map(({definition}) => ({
    tool: fromToolDefinition(definition as ToolDefinition<TSchema, unknown>, modelRuntime),
    prompt: {snippet: definition.promptSnippet, guidelines: definition.promptGuidelines ?? []},
  }));

  const hooks: HookRegistration[] = [];
  if (handlers.has("tool_call") || handlers.has("tool_result")) {
    hooks.push(
      hook(ToolTask, {
        beforeTool: async (call) => {
          // Old handlers mutate `event.input` in place to change arguments.
          const input = structuredClone(call.arguments) as Record<string, unknown>;
          const results = await emit(handlers.get("tool_call"), {type: "tool_call", toolCallId: call.id, toolName: call.name, input}, cwd);
          const blocked = results.find((result) => (result as {block?: boolean} | undefined)?.block) as {reason?: string} | undefined;
          if (blocked) return {block: blocked.reason ?? "Blocked by an extension."};
          return {arguments: input as never};
        },
        afterTool: async (call, result) => {
          if (!handlers.has("tool_result")) return undefined;
          let current = result;
          for (const handler of handlers.get("tool_result") ?? []) {
            const replaced = (await handler(
              {
                type: "tool_result",
                toolCallId: call.id,
                toolName: call.name,
                input: call.arguments,
                content: current.content ?? [],
                details: current.details,
                isError: current.isError ?? false,
              },
              handlerContext(cwd)
            )) as {content?: (TextContent | ImageContent)[]; details?: unknown; isError?: boolean} | undefined;
            if (replaced)
              current = {
                ...current,
                ...(replaced.content ? {content: replaced.content} : {}),
                ...(replaced.isError === undefined ? {} : {isError: replaced.isError}),
                ...(replaced.details === undefined ? {} : {details: replaced.details as never}),
              };
          }
          return current;
        },
      })
    );
  }
  if (handlers.has("context")) {
    hooks.push(
      hook(GenerationTask, {
        beforeRequest: async (request) => {
          let messages = [...request.messages] as Message[];
          for (const handler of handlers.get("context") ?? []) {
            const result = (await handler({type: "context", messages}, handlerContext(cwd))) as {messages?: Message[]} | undefined;
            if (result?.messages) messages = result.messages;
          }
          return {messages};
        },
      })
    );
  }

  return {extension: defineExtension({name: `extension:${source.path}`, hooks}), tools};
}

/** The extensions of one project, bridged; `start()`/`stop()` deliver `session_start` and `session_shutdown`. */
export interface BridgedExtensions {
  readonly extensions: readonly Extension[];
  readonly tools: readonly PromptedTool[];
  readonly start: () => Promise<void>;
  readonly stop: (reason: "quit" | "reload") => Promise<void>;
}

/**
 * Bridges every extension the resource loader collected into engine extensions. Pi's `ExtensionRunner` is wired to
 * the old engine, so this is ours; keep it the only module that knows the old extension shapes.
 */
export function bridgeExtensions(input: {
  readonly cwd: string;
  readonly loaded: LoadExtensionsResult;
  readonly modelRuntime: ModelRuntime;
  readonly report: (diagnostic: ExtensionDiagnostic) => void;
}): BridgedExtensions {
  const bridged = input.loaded.extensions.map((extension) => bridgeExtension(extension, input, input.report));
  const lifecycle = (event: "session_start" | "session_shutdown", fields: Record<string, unknown>) => async () => {
    for (const extension of input.loaded.extensions) {
      try {
        await emit((extension.handlers as Map<string, Handler[]>).get(event), {type: event, ...fields}, input.cwd);
      } catch (error) {
        input.report({extensionPath: extension.path, message: `${event} failed: ${error instanceof Error ? error.message : String(error)}`});
      }
    }
  };
  return {
    extensions: bridged.map(({extension}) => extension),
    tools: bridged.flatMap(({tools}) => tools),
    start: lifecycle("session_start", {reason: "startup"}),
    stop: (reason) => lifecycle("session_shutdown", {reason})(),
  };
}
