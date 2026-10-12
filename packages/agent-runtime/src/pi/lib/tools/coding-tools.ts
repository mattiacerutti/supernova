import type {SettingsManager} from "@earendil-works/pi-coding-agent";
import {createBashToolDefinition, createEditToolDefinition, createReadToolDefinition, createWriteToolDefinition} from "@earendil-works/pi-coding-agent";
import type {ToolDefinition} from "@earendil-works/pi-coding-agent";
import type {Extension, ToolRegistration} from "@earendil-works/pi-durable";
import {createBashTool, createEditTool, createReadTool, createWriteTool} from "@earendil-works/pi-durable/tools";

/** How the system prompt lists a tool: one line under `<tools>` and bullets under `<rules>`, as the old SDK's prompt did. */
interface ToolPrompt {
  readonly snippet?: string;
  readonly guidelines: readonly string[];
}

/**
 * An engine tool with its prompt text. The engine has no field for how the system prompt should describe a tool, only
 * `description` for the model's tool schema, so the text rides on the tool: the engine passes tools through unchanged,
 * and the prompt section reads it from the request's tools. Every tool a session installs is one, so the prompt never
 * meets a tool it cannot describe; a tool with nothing to say has an empty `guidelines` and no `snippet`. If the engine
 * adds such a field, use it instead.
 */
export type PromptedTool = ToolRegistration & {readonly prompt: ToolPrompt};

/** An engine extension whose tools carry their prompt text; the only kind a session installs. */
export type SessionExtension = Extension<PromptedTool>;

/** Durable coding tools with Pi's prompt contributions and the configured shell command prefix. */
export function createCodingTools(input: {readonly cwd: string; readonly settings: SettingsManager}): PromptedTool[] {
  const {cwd, settings} = input;

  const read = createReadToolDefinition(cwd);
  const bash = createBashToolDefinition(cwd, {exposeSessionEnvironment: false});
  const edit = createEditToolDefinition(cwd);
  const write = createWriteToolDefinition(cwd);

  const commandPrefix = settings.getShellCommandPrefix();

  const promptOf = (definition: Pick<ToolDefinition, "promptGuidelines" | "promptSnippet">): ToolPrompt => {
    return {snippet: definition.promptSnippet, guidelines: definition.promptGuidelines ?? []};
  };

  return [
    {...createReadTool(), prompt: promptOf(read)},
    {...createBashTool({commandPrefix}), prompt: promptOf(bash)},
    {...createEditTool(), prompt: promptOf(edit)},
    {...createWriteTool(), prompt: promptOf(write)},
  ];
}
