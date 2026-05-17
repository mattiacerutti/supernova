import type {ImageContent} from "@earendil-works/pi-ai";
import type {SessionAttachment} from "@pi-desktop/contracts/sessions/schemas";

export const ATTACHMENTS_CUSTOM_TYPE = "pi-desktop.attachments";
export const TEXT_ATTACHMENTS_CUSTOM_TYPE = "pi-desktop.text-attachments";

export type AttachmentKind = "image" | "text";

export interface AttachmentMetadata {
  readonly id: string;
  readonly kind: AttachmentKind;
  readonly mime: string;
  readonly name: string;
  readonly order: number;
  readonly size: number;
}

export interface Attachments {
  readonly images: ImageContent[];
  readonly metadata: AttachmentMetadata[];
  readonly textContent: string | undefined;
}

function attachmentKind(mime: string): AttachmentKind | undefined {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/")) return "text";
  return undefined;
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function textAttachmentBlock(input: {attachment: AttachmentMetadata; content: string}): string {
  const {attachment, content} = input;
  return `  <attachment id="${escapeXml(attachment.id)}" name="${escapeXml(attachment.name)}" mime="${escapeXml(attachment.mime)}" size="${attachment.size}">\n${escapeXml(content)}\n  </attachment>`;
}

export function prepareAttachments(attachments: readonly SessionAttachment[]): Attachments {
  const images: ImageContent[] = [];
  const metadata: AttachmentMetadata[] = [];
  const textAttachments: Array<{attachment: AttachmentMetadata; content: string}> = [];

  for (const [order, attachment] of attachments.entries()) {
    const kind = attachmentKind(attachment.mime);
    if (!kind) continue;

    const attachmentMetadata: AttachmentMetadata = {
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
