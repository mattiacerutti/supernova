import type {ImageContent} from "@earendil-works/pi-ai";
import type {UserMessageAttachmentPart, UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";

/** Converts user message content parts into the plain text prompt content sent to Pi. */
export function contentFromParts(contentParts: readonly UserMessageContentPart[]): string {
  return contentParts
    .map((part) => {
      if (part.type === "text") return part.text;
      if (part.type === "reference") return part.value;
      return "";
    })
    .join("");
}

/** Extracts image attachments as Pi image content parts. */
export function imageContentFromParts(contentParts: readonly UserMessageContentPart[]): ImageContent[] {
  return contentParts
    .filter((part): part is UserMessageAttachmentPart => part.type === "attachment" && part.kind === "image" && Boolean(part.contentBase64))
    .map((part) => ({data: part.contentBase64 ?? "", mimeType: part.mime, type: "image"}));
}
