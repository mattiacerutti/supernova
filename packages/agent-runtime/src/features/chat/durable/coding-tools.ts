import type {SettingsManager} from "@earendil-works/pi-coding-agent";
import {createBashToolDefinition, createEditToolDefinition, createReadToolDefinition, createWriteToolDefinition} from "@earendil-works/pi-coding-agent";
import type {ToolDefinition} from "@earendil-works/pi-coding-agent";
import type {Extension, ToolRegistration} from "@earendil-works/pi-durable";
import {createBashTool, createEditTool, createReadTool, createWriteTool} from "@earendil-works/pi-durable/tools";
import {userProcessEnv} from "@supernova/agent-runtime/lib/user-process-env";

interface ToolPrompt {
  readonly snippet?: string;
  readonly guidelines: readonly string[];
}

/**
 * The engine has no field for how the prompt describes a tool, so the text rides on the tool. Use the engine's if it
 * adds one.
 */
export type PromptedTool = ToolRegistration & {readonly prompt: ToolPrompt};

export type SessionExtension = Extension<PromptedTool>;

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
    {
      ...createBashTool({
        commandPrefix,
        // The engine's default inherits all of process.env; pass the filtered environment instead.
        prepare: (execution) => {
          execution.env = {...userProcessEnv(), ...execution.env};
          execution.inheritEnv = false;
        },
      }),
      prompt: promptOf(bash),
    },
    {...createEditTool(), prompt: promptOf(edit)},
    {...createWriteTool(), prompt: promptOf(write)},
  ];
}
