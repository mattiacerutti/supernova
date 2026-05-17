import type {SessionUserMessageContentPart} from "@pi-desktop/contracts/sessions/schemas";

export const USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE = "pi-desktop.user-message-content-parts";

/** Validates that the provided content parts match the actual content string. */
export function validContentParts(content: string, contentParts: readonly SessionUserMessageContentPart[] | undefined): readonly SessionUserMessageContentPart[] | undefined {
  if (!contentParts?.length) return undefined;

  const extractedContent = contentParts.map((part) => (part.type === "text" ? part.text : part.value)).join("");

  return extractedContent === content ? contentParts : undefined;
}
