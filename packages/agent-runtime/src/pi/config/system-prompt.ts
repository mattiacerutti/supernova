// Ported from Pi's packages/coding-agent/src/core/system-prompt.ts.
import type {Skill} from "@earendil-works/pi-coding-agent";
import {formatSkillsForPrompt, getDocsPath, getExamplesPath, getReadmePath} from "@earendil-works/pi-coding-agent";
import type {Extension, PromptInput} from "@earendil-works/pi-durable";
import {defineExtension, section} from "@earendil-works/pi-durable";
import type {ToolPromptContribution} from "@supernova/agent-runtime/pi/lib/tools/coding-tools";

interface SystemPromptInput {
  /** Tools offered in the request, in order. */
  readonly selectedTools: readonly string[];
  /** One-line snippets keyed by tool name; a tool without one is not listed. */
  readonly toolSnippets: Readonly<Record<string, string>>;
  /** Guideline bullets contributed by each tool. */
  readonly toolGuidelines: Readonly<Record<string, readonly string[]>>;
  readonly cwd: string;
  readonly contextFiles: readonly {readonly path: string; readonly content: string}[];
  readonly skills: readonly Skill[];
}

/** Section order of Pi's prompt; sections without content are omitted. */
const SYSTEM_PROMPT_KEYS = ["preamble", "tools", "rules", "docs", "project_context", "skills", "cwd"] as const;

function renderProjectContext(contextFiles: SystemPromptInput["contextFiles"]): string {
  return [
    "Project-specific instructions and guidelines:",
    ...contextFiles.map(({path, content}) => `<project_instructions path="${path}">\n${content}\n</project_instructions>`),
  ].join("\n\n");
}

function buildRules(selectedTools: readonly string[], toolGuidelines: SystemPromptInput["toolGuidelines"]): string {
  const rules: string[] = [];
  const seen = new Set<string>();
  const addRule = (rule: string): void => {
    const normalized = rule.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    rules.push(normalized);
  };

  const hasBash = selectedTools.includes("bash");
  const hasPowerShell = selectedTools.includes("powershell");
  const hasGrep = selectedTools.includes("grep");
  const hasFind = selectedTools.includes("find");
  const hasLs = selectedTools.includes("ls");

  if ((hasBash || hasPowerShell) && !hasGrep && !hasFind && !hasLs) {
    if (hasBash && hasPowerShell) addRule("Use bash or PowerShell for file operations like listing, searching, and finding files");
    else if (hasPowerShell) addRule("Use PowerShell for file operations like listing, searching, and finding files");
    else addRule("Use bash for file operations like ls, rg, find");
  }

  for (const name of selectedTools) {
    for (const rule of toolGuidelines[name] ?? []) addRule(rule);
  }
  addRule("Be concise in your responses");
  addRule("Show file paths clearly when working with files");
  return rules.map((rule) => `- ${rule}`).join("\n");
}

/** Pi's system prompt as ordered sections; every section but `preamble` carries its own `<key>` tag. */
function buildSystemPromptSections(input: SystemPromptInput): Record<string, string> {
  const {selectedTools, toolSnippets, toolGuidelines, cwd, contextFiles, skills} = input;
  const promptSections: Record<string, string> = {};
  promptSections.preamble =
    "You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.";
  const visibleTools = selectedTools.filter((name) => !!toolSnippets[name]);
  const tools = visibleTools.length > 0 ? visibleTools.map((name) => `- ${name}: ${toolSnippets[name]}`).join("\n") : "(none)";
  promptSections.tools = `${tools}\n\nIn addition to the tools above, you may have access to other custom tools depending on the project.`;
  promptSections.rules = buildRules(selectedTools, toolGuidelines);
  promptSections.docs = `Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: ${getReadmePath()}
- Additional docs: ${getDocsPath()}
- Examples: ${getExamplesPath()} (extensions, custom tools, SDK)
- When reading pi docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md), environment variables (docs/environment-variables.md), MCP servers (docs/mcp.md), codemode scripts and non-LLM models such as classifiers and image models (docs/codemode.md)
- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing
- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)`;

  if (contextFiles.length > 0) promptSections.project_context = renderProjectContext(contextFiles);
  const skillFileReadTool = (["read", "bash"] as const).find((tool) => selectedTools.includes(tool));
  if (skillFileReadTool && skills.length > 0) {
    const skillsPrompt = formatSkillsForPrompt([...skills], skillFileReadTool).trim();
    if (skillsPrompt) promptSections.skills = skillsPrompt;
  }
  promptSections.cwd = cwd.replace(/\\/g, "/");

  const sections: Record<string, string> = {preamble: promptSections.preamble};
  for (const [name, content] of Object.entries(promptSections)) {
    if (name !== "preamble") sections[name] = `<${name}>\n${content}\n</${name}>`;
  }
  return sections;
}

/** What a session's prompt is built from besides its tools: context files and skills of its working directory. */
export interface PromptResources {
  readonly contextFiles: readonly {readonly path: string; readonly content: string}[];
  readonly skills: readonly Skill[];
}

/**
 * Pi's system prompt as one extension of sections, rendered per request from the tools that request offers. The
 * sections of one request render from one build. Resources are read through `resources()` at each render, so a
 * reloaded project shows up in the next request; unchanged sections are not resent.
 */
export function createPromptExtension(input: {
  readonly cwd: string;
  readonly resources: () => PromptResources;
  readonly toolPrompts: ReadonlyMap<string, ToolPromptContribution>;
}): Extension {
  const built = new WeakMap<PromptInput, Record<string, string>>();
  const build = (prompt: PromptInput): Record<string, string> => {
    let sections = built.get(prompt);
    if (!sections) {
      const selectedTools = prompt.agent.tools.map((tool) => tool.name);
      const contributions = input.toolPrompts;
      const toolSnippets: Record<string, string> = {};
      const toolGuidelines: Record<string, readonly string[]> = {};
      for (const name of selectedTools) {
        const contribution = contributions.get(name);
        if (contribution?.snippet) toolSnippets[name] = contribution.snippet;
        if (contribution) toolGuidelines[name] = contribution.guidelines;
      }
      const {contextFiles, skills} = input.resources();
      sections = buildSystemPromptSections({contextFiles, cwd: prompt.env?.cwd ?? prompt.agent.cwd ?? input.cwd, selectedTools, skills, toolGuidelines, toolSnippets});
      built.set(prompt, sections);
    }
    return sections;
  };
  return defineExtension({
    name: "supernova-prompt",
    // The built sections carry their own tags.
    sections: SYSTEM_PROMPT_KEYS.map((key) => section(key, (prompt) => build(prompt)[key], {tag: false})),
  });
}
