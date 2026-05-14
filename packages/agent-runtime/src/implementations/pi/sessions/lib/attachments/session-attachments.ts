import type {ImageContent} from "@mariozechner/pi-ai";
import type {AgentSessionAttachment} from "@pi-desktop/contracts/sessions/schemas";

export const ATTACHMENTS_CUSTOM_TYPE = "pi-desktop.attachments";
export const TEXT_ATTACHMENTS_CUSTOM_TYPE = "pi-desktop.text-attachments";

export type SupportedAttachmentKind = "image" | "text";

export interface SessionAttachmentMetadata {
  readonly id: string;
  readonly kind: SupportedAttachmentKind;
  readonly mime: string;
  readonly name: string;
  readonly order: number;
  readonly size: number;
}

export interface SessionAttachmentMetadataData {
  readonly attachments: readonly SessionAttachmentMetadata[];
}

export interface PreparedSessionAttachments {
  readonly images: ImageContent[];
  readonly metadata: SessionAttachmentMetadata[];
  readonly textContent: string | undefined;
}

function attachmentKind(mime: string): SupportedAttachmentKind | undefined {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/")) return "text";
  return undefined;
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function textAttachmentBlock(input: {attachment: SessionAttachmentMetadata; content: string}): string {
  const {attachment, content} = input;
  return `  <attachment id="${escapeXml(attachment.id)}" name="${escapeXml(attachment.name)}" mime="${escapeXml(attachment.mime)}" size="${attachment.size}">\n${escapeXml(content)}\n  </attachment>`;
}

export function prepareSessionAttachments(attachments: readonly AgentSessionAttachment[]): PreparedSessionAttachments {
  const images: ImageContent[] = [];
  const metadata: SessionAttachmentMetadata[] = [];
  const textAttachments: Array<{attachment: SessionAttachmentMetadata; content: string}> = [];

  for (const [order, attachment] of attachments.entries()) {
    const kind = attachmentKind(attachment.mime);
    if (!kind) continue;

    const attachmentMetadata: SessionAttachmentMetadata = {
      id: attachment.id,
      kind,
      mime: attachment.mime,
      name: attachment.name,
      order,
      size: attachment.size,
    };
    metadata.push(attachmentMetadata);

    if (!attachment.contentBase64) continue;

    if (kind === "image") {
      images.push({data: attachment.contentBase64, mimeType: attachment.mime, type: "image"});
      continue;
    }

    textAttachments.push({attachment: attachmentMetadata, content: Buffer.from(attachment.contentBase64, "base64").toString("utf8")});
  }

  return {
    images,
    metadata,
    textContent: textAttachments.length > 0 ? `<attachments>\n${textAttachments.map(textAttachmentBlock).join("\n")}\n</attachments>` : undefined,
  };
}
