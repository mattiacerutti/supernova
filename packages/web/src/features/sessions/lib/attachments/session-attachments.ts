import type {UserMessageAttachmentPart} from "@supernova/contracts/sessions/schemas";
import {attachmentMime, fileExtension} from "@/features/sessions/lib/attachments/attachment-classification";

export const MAX_SESSION_ATTACHMENTS = 10;
export const MAX_SESSION_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export {fileRequiresImageCapability, SESSION_ATTACHMENT_ACCEPT} from "@/features/sessions/lib/attachments/attachment-classification";

export class UnsupportedAttachmentTypeError extends Error {
  constructor(fileName: string) {
    super(`${fileName} is not a supported attachment type.`);
    this.name = "UnsupportedAttachmentTypeError";
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return globalThis.btoa(binary);
}

/** Formats an attachment type label from its extension or MIME subtype. */
export function formatAttachmentType(attachment: {mime: string; name: string}): string {
  const extension = fileExtension(attachment.name);
  if (extension) return extension.toUpperCase();

  const subtype = attachment.mime.split("/").at(1);
  if (!subtype || subtype === "octet-stream") return "FILE";

  return (
    subtype
      .split(/[+;.-]/)
      .at(0)
      ?.toUpperCase() ?? "FILE"
  );
}

function attachmentKind(mime: string): UserMessageAttachmentPart["kind"] | undefined {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/")) return "text";
  return undefined;
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Converts a browser File into the serializable attachment content part sent with user messages. */
export async function fileToSessionAttachmentPart(file: File): Promise<UserMessageAttachmentPart> {
  const buffer = await file.arrayBuffer();
  const mime = attachmentMime(file, buffer);
  const kind = mime ? attachmentKind(mime) : undefined;

  if (!mime || !kind) {
    throw new UnsupportedAttachmentTypeError(file.name);
  }

  return {
    id: `att_${crypto.randomUUID()}`,
    kind,
    mime,
    name: file.name,
    size: file.size,
    contentBase64: arrayBufferToBase64(buffer),
    type: "attachment",
  };
}
