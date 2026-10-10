import type {Model} from "@earendil-works/pi-ai";
import type {ExtensionContext, ExtensionUIContext, ModelRuntime} from "@earendil-works/pi-coding-agent";
import {ModelRegistry} from "@earendil-works/pi-coding-agent";

/**
 * The old SDK's `ctx.ui` as Supernova has always run it: print mode, no UI. Dialogs resolve to "no answer"
 * (`select`/`input` undefined, `confirm` false) and everything that draws is a no-op, exactly Pi's own `noOpUIContext`
 * for headless runs. The terminal `theme` is the one member we cannot stand in for; it throws when read.
 */
export const headlessUi: ExtensionUIContext = {
  select: async () => undefined,
  confirm: async () => false,
  input: async () => undefined,
  notify: () => {},
  onTerminalInput: () => () => {},
  setStatus: () => {},
  setWorkingMessage: () => {},
  setWorkingVisible: () => {},
  setWorkingIndicator: () => {},
  setHiddenThinkingLabel: () => {},
  setWidget: () => {},
  setFooter: () => {},
  setHeader: () => {},
  setTitle: () => {},
  custom: async () => undefined as never,
  pasteToEditor: () => {},
  setEditorText: () => {},
  getEditorText: () => "",
  editor: async () => undefined,
  addAutocompleteProvider: () => {},
  setEditorComponent: () => {},
  getEditorComponent: () => undefined,
  get theme(): ExtensionUIContext["theme"] {
    throw new Error("ctx.ui.theme is not available in Supernova: there is no terminal theme.");
  },
  getAllThemes: () => [],
  getTheme: () => undefined,
  setTheme: () => ({success: false, error: "UI not available"}),
  getToolsExpanded: () => false,
  setToolsExpanded: () => {},
};

/** What Supernova knows for one handler or tool call; the rest of `ctx` is built from it. */
export interface ExtensionContextInput {
  readonly cwd: string;
  readonly modelRuntime: ModelRuntime;
  readonly model: Model<never> | undefined;
  readonly thinkingLevel: ExtensionContext["thinkingLevel"];
  readonly signal: AbortSignal | undefined;
}

/**
 * The old SDK's `ExtensionContext` in print mode, as the old Supernova bound it. Members the engine has no equivalent
 * for (`sessionManager`, agent control) throw with the member's name when used, since the old SDK's objects do not
 * exist here; everything else behaves as it did headless.
 */
export function extensionContext(input: ExtensionContextInput): ExtensionContext {
  const unavailable = (member: string) => (): never => {
    throw new Error(`ctx.${member} is not available in Supernova.`);
  };
  return {
    ui: headlessUi,
    mode: "print",
    hasUI: false,
    cwd: input.cwd,
    get sessionManager(): ExtensionContext["sessionManager"] {
      return unavailable("sessionManager")();
    },
    modelRegistry: new ModelRegistry(input.modelRuntime),
    model: input.model,
    scopedModels: [],
    thinkingLevel: input.thinkingLevel,
    isIdle: () => input.signal === undefined,
    isProjectTrusted: () => true,
    signal: input.signal,
    abort: unavailable("abort"),
    hasPendingMessages: () => false,
    shutdown: unavailable("shutdown"),
    getContextUsage: () => undefined,
    compact: unavailable("compact"),
    getSystemPrompt: unavailable("getSystemPrompt"),
  };
}
