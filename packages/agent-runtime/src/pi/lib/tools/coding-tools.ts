import {extname} from "node:path";
import type {ModelRuntime, SettingsManager} from "@earendil-works/pi-coding-agent";
import {createBashToolDefinition, createEditToolDefinition, createReadToolDefinition, createWriteToolDefinition} from "@earendil-works/pi-coding-agent";
import type {ToolDefinition} from "@earendil-works/pi-coding-agent";
import type {TSchema} from "@earendil-works/pi-ai";
import type {ToolRegistration} from "@earendil-works/pi-durable";
import {createBashTool, createEditTool, createReadTool, createWriteTool} from "@earendil-works/pi-durable/tools";
import {fromToolDefinition} from "@supernova/agent-runtime/pi/lib/tools/tool-definition";

/** File types the old SDK's `read` returned as images; the engine's `read` rejects them. */
const IMAGE_EXTENSIONS = new Set([".bmp", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);

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

function promptOf(definition: Pick<ToolDefinition, "promptGuidelines" | "promptSnippet">): ToolPromptContribution {
  return {snippet: definition.promptSnippet, guidelines: definition.promptGuidelines ?? []};
}

/**
 * The engine's `read`, falling back to the old SDK's `read` for images. Its description is the old one, which tells
 * the model images are supported; text reads stay on the engine.
 *
 * TODO(pi-durable): workaround. pi-durable's `read` rejects images with `unsupported_image`; its README, CHANGELOG,
 * spec and source all say "not supported yet". This keeps today's behaviour by running the old SDK's `read`, which ties
 * us to old-engine tool code. Monitor upstream: when the engine's `read` returns images, delete this wrapper and the
 * old definition's use here, and confirm `images.autoResize` is honoured.
 */
function createImageAwareReadTool(definition: ToolDefinition<TSchema, unknown>, modelRuntime: ModelRuntime): ToolRegistration {
  const text = createReadTool();
  const image = fromToolDefinition(definition, modelRuntime);
  return {
    ...text,
    description: definition.description,
    execute: (args, api, context) => {
      const path = (args as {path?: unknown}).path;
      const isImage = typeof path === "string" && IMAGE_EXTENSIONS.has(extname(path).toLowerCase());
      return (isImage ? image : text).execute(args as never, api, context);
    },
  } as ToolRegistration;
}

/**
 * `read`, `write`, `edit`, and `bash` as Supernova offers them: the engine's implementations, with the old SDK's
 * settings (`images.autoResize`, `shellCommandPrefix`) and the `PI_*` environment the old `bash` exported.
 * The old definitions are built only for their prompt text and the image path of `read`.
 */
export function createCodingTools(input: {
  readonly cwd: string;
  readonly modelRuntime: ModelRuntime;
  readonly sessionId: string;
  readonly settings: SettingsManager;
}): PromptedTool[] {
  const {cwd, modelRuntime, sessionId, settings} = input;
  const read = createReadToolDefinition(cwd, {autoResizeImages: settings.getImageAutoResize()});
  const bash = createBashToolDefinition(cwd);
  const commandPrefix = settings.getShellCommandPrefix();
  return [
    {tool: createImageAwareReadTool(read as ToolDefinition<TSchema, unknown>, modelRuntime), prompt: promptOf(read)},
    {
      tool: createBashTool({
        ...(commandPrefix ? {commandPrefix} : {}),
        // The old bash told the model these exist (see its prompt guideline); PI_SESSION_FILE has no counterpart.
        prepare: async (execution, api, context) => {
          const agent = await api.agent(context);
          execution.env.PI_SESSION_ID = sessionId;
          if (agent.model) {
            execution.env.PI_PROVIDER = agent.model.provider;
            execution.env.PI_MODEL = agent.model.modelId;
          }
          execution.env.PI_REASONING_LEVEL = agent.thinkingLevel;
        },
      }),
      prompt: promptOf(bash),
    },
    {tool: createEditTool(), prompt: promptOf(createEditToolDefinition(cwd))},
    {tool: createWriteTool(), prompt: promptOf(createWriteToolDefinition(cwd))},
  ];
}
