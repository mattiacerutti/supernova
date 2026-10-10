import type {ModelRuntime} from "@earendil-works/pi-coding-agent";
import type {Extension} from "@earendil-works/pi-durable";
import {bridgeExtensions} from "@supernova/agent-runtime/pi/extensions/legacy/extension-bridge";
import type {PromptedTool} from "@supernova/agent-runtime/pi/lib/tools/coding-tools";
import type {ProjectResources} from "@supernova/agent-runtime/pi/resource-cache";

/** The extensions a session installs, from every source Supernova loads them from, as engine extensions. */
export interface LoadedExtensions {
  readonly extensions: readonly Extension[];
  /** Tools the extensions register, with their prompt text; installed beside the coding tools. */
  readonly tools: readonly PromptedTool[];
  /** Delivers the session lifecycle to extensions that observe it; `start` after the file opens, `stop` before it closes. */
  readonly start: () => Promise<void>;
  readonly stop: (reason: "quit" | "reload") => Promise<void>;
}

export interface LoadExtensionsInput {
  readonly cwd: string;
  readonly resources: ProjectResources;
  readonly modelRuntime: ModelRuntime;
  /** A problem that does not fail the load: a capability an extension asked for that Supernova lacks. */
  readonly report: (message: string) => void;
}

/**
 * The one place extension sources meet. Today the only source is extensions written for Pi's old SDK, bridged onto the
 * engine (`legacy/`); Pi's durable extension format is not final, so none loads directly yet. When it does, it joins
 * here and `legacy/` goes.
 */
export function loadExtensions(input: LoadExtensionsInput): LoadedExtensions {
  return bridgeExtensions({
    cwd: input.cwd,
    loaded: input.resources.extensions,
    modelRuntime: input.modelRuntime,
    report: ({extensionPath, message}) => input.report(`Extension ${extensionPath} ${message}`),
  });
}
