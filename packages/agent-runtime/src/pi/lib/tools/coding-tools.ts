import type {SettingsManager} from "@earendil-works/pi-coding-agent";
import {createBashToolDefinition, createEditToolDefinition, createReadToolDefinition, createWriteToolDefinition} from "@earendil-works/pi-coding-agent";
import type {ToolDefinition} from "@earendil-works/pi-coding-agent";
import type {ToolRegistration} from "@earendil-works/pi-durable";
import {createBashTool, createEditTool, createReadTool, createWriteTool} from "@earendil-works/pi-durable/tools";

/** Prompt snippet and guideline bullets of one tool, as the old SDK's prompt listed them. */
export interface ToolPromptContribution {
  readonly snippet?: string;
  readonly guidelines: readonly string[];
}

/** A tool and the prompt text the old SDK showed for it. */
export interface PromptedTool {
  readonly tool: ToolRegistration;
  readonly prompt: ToolPromptContribution;
}

/** Durable coding tools with Pi's prompt contributions and the configured shell command prefix. */
export function createCodingTools(input: {readonly cwd: string; readonly settings: SettingsManager}): PromptedTool[] {
  const {cwd, settings} = input;

  const read = createReadToolDefinition(cwd);
  const bash = createBashToolDefinition(cwd, {exposeSessionEnvironment: false});
  const edit = createEditToolDefinition(cwd);
  const write = createWriteToolDefinition(cwd);

  const commandPrefix = settings.getShellCommandPrefix();

  const promptOf = (definition: Pick<ToolDefinition, "promptGuidelines" | "promptSnippet">): ToolPromptContribution => {
    return {snippet: definition.promptSnippet, guidelines: definition.promptGuidelines ?? []};
  };

  return [
    {tool: createReadTool(), prompt: promptOf(read)},
    {tool: createBashTool({commandPrefix}), prompt: promptOf(bash)},
    {tool: createEditTool(), prompt: promptOf(edit)},
    {tool: createWriteTool(), prompt: promptOf(write)},
  ];
}
