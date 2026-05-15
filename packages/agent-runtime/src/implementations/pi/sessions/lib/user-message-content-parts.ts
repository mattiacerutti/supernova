import type {SessionUserMessageContentPart} from "@pi-desktop/contracts/sessions/schemas";

export const USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE = "pi-desktop.user-message-content-parts";

export interface SessionUserMessageContentPartsData {
  readonly contentParts: readonly SessionUserMessageContentPart[];
}

export function contentFromParts(contentParts: readonly SessionUserMessageContentPart[]): string {
  return contentParts.map((part) => (part.type === "text" ? part.text : part.value)).join("");
}

export function validContentPartsForMessage(
  content: string,
  contentParts: readonly SessionUserMessageContentPart[] | undefined
): readonly SessionUserMessageContentPart[] | undefined {
  if (!contentParts?.length) return undefined;
  return contentFromParts(contentParts) === content ? contentParts : undefined;
}
