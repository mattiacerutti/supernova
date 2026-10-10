// Ported from Pi's packages/coding-agent/src/core/system-prompt.ts.
import type {Skill} from "@earendil-works/pi-coding-agent";
import {formatSkillsForPrompt, getDocsPath, getExamplesPath, getReadmePath} from "@earendil-works/pi-coding-agent";
import type {PromptInput, PromptSection, ToolRegistration} from "@earendil-works/pi-durable";
import {section} from "@earendil-works/pi-durable";
import type {ToolPromptContribution} from "@supernova/agent-runtime/pi/lib/tools/coding-tools";

function renderPreamble(): string {
  return "You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.";
}

function renderProjectContext(contextFiles: PromptResources["contextFiles"]): string | undefined {
  if (contextFiles.length === 0) return undefined;
  return [
    "Project-specific instructions and guidelines:",
    ...contextFiles.map(({path, content}) => `<project_instructions path="${path}">\n${content}\n</project_instructions>`),
  ].join("\n\n");
}

function renderTools(tools: readonly ToolRegistration[], prompts: ReadonlyMap<string, ToolPromptContribution>): string {
  const lines = tools.flatMap(({name}) => {
    const snippet = prompts.get(name)?.snippet;
    return snippet ? [`- ${name}: ${snippet}`] : [];
  });
  return `${lines.length > 0 ? lines.join("\n") : "(none)"}\n\nIn addition to the tools above, you may have access to other custom tools depending on the project.`;
}

function renderRules(tools: readonly ToolRegistration[], prompts: ReadonlyMap<string, ToolPromptContribution>): string {
  const selectedTools = tools.map((tool) => tool.name);
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
    for (const rule of prompts.get(name)?.guidelines ?? []) addRule(rule);
  }
  addRule("Be concise in your responses");
  addRule("Show file paths clearly when working with files");
  return rules.map((rule) => `- ${rule}`).join("\n");
}

function renderDocs(): string {
  return `Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: ${getReadmePath()}
- Additional docs: ${getDocsPath()}
- Examples: ${getExamplesPath()} (extensions, custom tools, SDK)
- When reading pi docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md), environment variables (docs/environment-variables.md), MCP servers (docs/mcp.md), codemode scripts and non-LLM models such as classifiers and image models (docs/codemode.md)
- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing
- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)`;
}

function renderSkills(tools: readonly ToolRegistration[], resources: () => PromptResources): string | undefined {
  const readTool = (["read", "bash"] as const).find((name) => tools.some((tool) => tool.name === name));
  if (!readTool) return undefined;
  const {skills} = resources();
  if (skills.length === 0) return undefined;
  return formatSkillsForPrompt([...skills], readTool).trim() || undefined;
}

function renderCwd({env, agent}: PromptInput, fallback: string): string {
  return (env?.cwd ?? agent.cwd ?? fallback).replace(/\\/g, "/");
}

/** What a session's prompt is built from besides its tools: context files and skills of its working directory. */
export interface PromptResources {
  readonly contextFiles: readonly {readonly path: string; readonly content: string}[];
  readonly skills: readonly Skill[];
}

/** Pi's system-prompt sections, rendered independently from the request's tools and current project resources. */
export function createPromptSections(input: {
  readonly cwd: string;
  readonly resources: () => PromptResources;
  readonly toolPrompts: ReadonlyMap<string, ToolPromptContribution>;
}): PromptSection[] {
  const {cwd, resources, toolPrompts} = input;
  return [
    section("preamble", renderPreamble, {tag: false}),
    section("tools", ({agent}) => renderTools(agent.tools, toolPrompts)),
    section("rules", ({agent}) => renderRules(agent.tools, toolPrompts)),
    section("docs", renderDocs),
    section("project_context", () => renderProjectContext(resources().contextFiles)),
    section("skills", ({agent}) => renderSkills(agent.tools, resources)),
    section("cwd", (prompt) => renderCwd(prompt, cwd)),
  ];
}
