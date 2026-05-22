import type {ImageContent, TextContent} from "@earendil-works/pi-ai";
import type {UserMessageAttachmentPart, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";

export const USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE = "supernova.user-message-content-parts";

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

/** Restores Pi-returned image payloads onto stored user content parts. */
export function enrichContentPartsWithImages(input: {
  readonly content: string | readonly (TextContent | ImageContent)[];
  readonly contentParts: readonly UserMessageContentPart[];
}): readonly UserMessageContentPart[] {
  if (typeof input.content === "string") return input.contentParts;

  const images = input.content.filter((part): part is ImageContent => part.type === "image");
  let imageIndex = 0;

  return input.contentParts.map((part) => {
    if (part.type !== "attachment" || part.kind !== "image") return part;

    const image = images[imageIndex++];
    return image ? {...part, contentBase64: image.data} : part;
  });
}
