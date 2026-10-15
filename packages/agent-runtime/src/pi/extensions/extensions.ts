import type {ModelRuntime} from "@earendil-works/pi-coding-agent";
import type {SessionNotice} from "@supernova/contracts/services/session-runtime/procedures";
import {bridgeExtensions} from "@supernova/agent-runtime/pi/extensions/legacy/extension-bridge";
import type {SessionExtension} from "@supernova/agent-runtime/pi/lib/tools/coding-tools";
import type {ProjectResources} from "@supernova/agent-runtime/pi/resource-cache";

export interface LoadedExtensions {
  readonly extensions: readonly SessionExtension[];
  readonly start: () => Promise<void>;
  readonly stop: (reason: "quit" | "reload") => Promise<void>;
}

export interface LoadExtensionsInput {
  readonly cwd: string;
  readonly resources: ProjectResources;
  readonly modelRuntime: ModelRuntime;
  readonly report: (notice: Pick<SessionNotice, "message" | "extensionPath" | "extensionName">) => void;
}

/** Pi's durable extension format is not final; when it lands it joins here and `legacy/` goes. */
export function loadExtensions(input: LoadExtensionsInput): LoadedExtensions {
  return bridgeExtensions({
    cwd: input.cwd,
    loaded: input.resources.extensions,
    modelRuntime: input.modelRuntime,
    report: input.report,
  });
}
