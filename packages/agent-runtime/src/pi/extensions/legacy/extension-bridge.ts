import type {TSchema} from "@earendil-works/pi-ai";
import type {Extension as PiExtension, LoadExtensionsResult, ModelRuntime, ToolDefinition} from "@earendil-works/pi-coding-agent";
import type {Extension} from "@earendil-works/pi-durable";
import {defineExtension} from "@earendil-works/pi-durable";
import {extensionContext} from "@supernova/agent-runtime/pi/extensions/legacy/extension-context";
import type {Emit, Handler} from "@supernova/agent-runtime/pi/extensions/legacy/extension-events";
import {DELIVERED_EVENTS, eventHooks} from "@supernova/agent-runtime/pi/extensions/legacy/extension-events";
import {fromToolDefinition} from "@supernova/agent-runtime/pi/lib/tools/tool-definition";
import type {PromptedTool} from "@supernova/agent-runtime/pi/lib/tools/coding-tools";

/**
 * Old-SDK registrations that only a terminal UI shows. The old Supernova accepted them and never showed them; they are
 * reported so an author knows why nothing appears.
 */
const UNSUPPORTED_REGISTRATIONS = ["commands", "shortcuts", "flags", "messageRenderers"] as const;

interface BridgeInput {
  readonly cwd: string;
  readonly modelRuntime: ModelRuntime;
}

/** The context an event handler gets: the session's print-mode context, with no model or signal, as outside a tool call. */
function handlerContext(input: BridgeInput) {
  return extensionContext({cwd: input.cwd, model: undefined, modelRuntime: input.modelRuntime, signal: undefined, thinkingLevel: undefined});
}

/** An `Emit` over one extension's handlers: each gets the event with its `type` and a fresh print-mode context. */
function emitter(handlers: ReadonlyMap<string, readonly Handler[]>, input: BridgeInput): Emit {
  return async (event, fields) => {
    const results: unknown[] = [];
    for (const handler of handlers.get(event) ?? []) results.push(await handler({type: event, ...fields}, handlerContext(input)));
    return results;
  };
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
function bridgeExtension(source: PiExtension, input: BridgeInput, report: (diagnostic: ExtensionDiagnostic) => void): BridgedExtension {
  const {modelRuntime} = input;
  const handlers = source.handlers as Map<string, Handler[]>;
  for (const event of handlers.keys()) {
    if (!DELIVERED_EVENTS.has(event)) report({extensionPath: source.path, message: `subscribes to "${event}", which Supernova does not deliver.`});
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

  const hooks = eventHooks(new Set(handlers.keys()), emitter(handlers, input));
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
 * Maps the extensions Pi's loader found onto engine extensions. Pi's own `ExtensionRunner` drives the old engine, so it
 * cannot be reused here.
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
        await emitter(extension.handlers as Map<string, Handler[]>, input)(event, fields);
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
