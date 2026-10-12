import type {TSchema} from "@earendil-works/pi-ai";
import type {Extension as PiExtension, LoadExtensionsResult, ModelRuntime, ToolDefinition} from "@earendil-works/pi-coding-agent";
import {defineExtension} from "@earendil-works/pi-durable";
import {extensionContext} from "@supernova/agent-runtime/pi/extensions/legacy/extension-context";
import type {Emit, Handler} from "@supernova/agent-runtime/pi/extensions/legacy/extension-events";
import {DELIVERED_EVENTS, eventHooks} from "@supernova/agent-runtime/pi/extensions/legacy/extension-events";
import type {SessionExtension} from "@supernova/agent-runtime/pi/lib/tools/coding-tools";
import {fromToolDefinition} from "@supernova/agent-runtime/pi/lib/tools/tool-definition";

/**
 * Old-SDK registrations that only a terminal UI shows. The old Supernova accepted them and never showed them; they are
 * reported so an author knows why nothing appears.
 */
const UNSUPPORTED_REGISTRATIONS = ["commands", "shortcuts", "flags", "messageRenderers"] as const;
const REGISTRATION_LABELS: Record<(typeof UNSUPPORTED_REGISTRATIONS)[number], string> = {
  commands: "Commands",
  shortcuts: "Shortcuts",
  flags: "Flags",
  messageRenderers: "Renderers",
};

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

/** Converts one loaded extension: its tools to engine tools, its supported events to engine hooks. */
function bridgeExtension(source: PiExtension, input: BridgeInput, report: (diagnostic: ExtensionDiagnostic) => void): SessionExtension {
  const {modelRuntime} = input;
  const handlers = source.handlers as Map<string, Handler[]>;
  for (const event of handlers.keys()) {
    if (!DELIVERED_EVENTS.has(event)) report({extensionPath: source.path, message: `Event not delivered: ${event}`});
  }
  for (const registration of UNSUPPORTED_REGISTRATIONS) {
    const registered = source[registration] as Map<string, unknown> | undefined;
    if (registered && registered.size > 0) report({extensionPath: source.path, message: `${REGISTRATION_LABELS[registration]} not shown: ${[...registered.keys()].join(", ")}`});
  }

  const tools = [...source.tools.values()].map(({definition}) => fromToolDefinition(definition as ToolDefinition<TSchema, unknown>, modelRuntime));

  const hooks = eventHooks(new Set(handlers.keys()), emitter(handlers, input));
  return defineExtension({name: `extension:${source.path}`, hooks, tools});
}

/** The extensions of one project, bridged; `start()`/`stop()` deliver `session_start` and `session_shutdown`. */
export interface BridgedExtensions {
  readonly extensions: readonly SessionExtension[];
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
  const extensions = input.loaded.extensions.map((extension) => bridgeExtension(extension, input, input.report));
  const lifecycle = (event: "session_start" | "session_shutdown", fields: Record<string, unknown>) => async () => {
    for (const extension of input.loaded.extensions) {
      try {
        await emitter(extension.handlers as Map<string, Handler[]>, input)(event, fields);
      } catch (error) {
        input.report({extensionPath: extension.path, message: `${event} failed: ${(error instanceof Error ? error.message : String(error)).replace(/ in Supernova\.?$/, "")}`});
      }
    }
  };
  return {
    extensions,
    start: lifecycle("session_start", {reason: "startup"}),
    stop: (reason) => lifecycle("session_shutdown", {reason})(),
  };
}
