import {readFile} from "node:fs/promises";
import {DefaultResourceLoader, getAgentDir, SettingsManager} from "@earendil-works/pi-coding-agent";
import type {Skill} from "@earendil-works/pi-coding-agent";
import type {UserMessageAttachmentPart, UserMessageContentPart, UserMessageReferencePart} from "@supernova/contracts/sessions/schemas";
import {contentFromParts} from "@supernova/agent-runtime/implementations/pi/sessions/lib/user-message/content-parts";

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function textAttachmentBlock(attachment: UserMessageAttachmentPart): string | undefined {
  if (!attachment.contentBase64) return;

  const content = Buffer.from(attachment.contentBase64, "base64").toString("utf8");
  return `<attachment id="${escapeXml(attachment.id)}" name="${escapeXml(attachment.name)}" mime="${escapeXml(attachment.mime)}" size="${attachment.size}">\n${escapeXml(content)}\n</attachment>`;
}

function textAttachmentBlocks(contentParts: readonly UserMessageContentPart[]): string[] {
  return contentParts
    .filter((part): part is UserMessageAttachmentPart => part.type === "attachment" && part.kind === "text")
    .map(textAttachmentBlock)
    .filter((block): block is string => Boolean(block));
}

/** Loads a skill reference into the XML block added to the prompt. */
async function skillBlock(skill: Skill): Promise<string> {
  const content = await readFile(skill.filePath, "utf8");
  return [`<skill>`, `<name>${skill.name}</name>`, `<path>${skill.filePath}</path>`, content.trim(), `</skill>`].join("\n");
}

/** Resolves referenced skills into prompt blocks, skipping missing or unreadable skills. */
async function skillBlocks(input: {contentParts: readonly UserMessageContentPart[]; projectPath: string}): Promise<string[]> {
  const skillReferences = input.contentParts.filter((part): part is UserMessageReferencePart => part.type === "reference" && part.kind === "skill");
  if (skillReferences.length === 0) return [];

  const agentDir = getAgentDir();
  const resourceLoader = new DefaultResourceLoader({agentDir, cwd: input.projectPath, settingsManager: SettingsManager.create(input.projectPath, agentDir)});
  await resourceLoader.reload();

  const skillsByName = new Map(resourceLoader.getSkills().skills.map((skill) => [skill.name, skill]));
  const seen = new Set<string>();
  const blocks: string[] = [];

  for (const reference of skillReferences) {
    const skill = skillsByName.get(reference.value);
    if (!skill || seen.has(skill.filePath)) continue;

    const block = await skillBlock(skill).catch(() => undefined);
    if (!block) continue;

    seen.add(skill.filePath);
    blocks.push(block);
  }

  return blocks;
}

/** Builds the full prompt sent to Pi from message text, skill references, and text attachments. */
export async function buildPrompt(input: {contentParts: readonly UserMessageContentPart[]; projectPath: string}): Promise<string> {
  const content = contentFromParts(input.contentParts);

  const skills = await skillBlocks(input);
  const attachments = textAttachmentBlocks(input.contentParts);

  return [content, ...skills, ...attachments].filter((part) => part.length > 0).join("\n\n");
}
