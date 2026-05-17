import type {ImageContent, TextContent} from "@mariozechner/pi-ai";
import type {SessionAttachment} from "@pi-desktop/contracts/sessions/schemas";
import type {AttachmentMetadata} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/message-context/attachments";

export function piContentToText(content: string | (TextContent | ImageContent)[]): string {
  if (typeof content === "string") return content;

  return content
    .map((part) => (part.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

export function piUserAttachments(content: string | (TextContent | ImageContent)[], metadata: readonly AttachmentMetadata[] | undefined): SessionAttachment[] | undefined {
  if (!metadata?.length) return;

  const images = typeof content === "string" ? [] : content.filter((part): part is ImageContent => part.type === "image");
  let imageIndex = 0;

  return metadata.map((attachment) => {
    const base: SessionAttachment = {id: attachment.id, mime: attachment.mime, name: attachment.name, size: attachment.size};
    if (attachment.kind !== "image") return base;

    const image = images[imageIndex++];
    return image ? {...base, contentBase64: image.data} : base;
  });
}
