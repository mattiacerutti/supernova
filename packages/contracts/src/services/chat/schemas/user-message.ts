import {lit, num, obj, oneOf, opt, type Static, str, union} from "@earendil-works/chord";

export const UserMessageAttachmentKind = oneOf("image", "text");

export const UserMessageAttachmentPart = obj({
  /** Sent with the message; absent in the stored turn, whose image lives in Pi's user entry. */
  contentBase64: opt(str()),
  id: str(),
  kind: UserMessageAttachmentKind,
  name: str(),
  mime: str(),
  size: num(),
  type: lit("attachment"),
});

export const UserMessageTextPart = obj({
  text: str(),
  type: lit("text"),
});

export const UserMessageReferenceKind = oneOf("file", "skill");

export const UserMessageReferencePart = obj({
  id: str(),
  kind: UserMessageReferenceKind,
  name: str(),
  type: lit("reference"),
  value: str(),
});

export const UserMessageContentPart = union([UserMessageTextPart, UserMessageReferencePart, UserMessageAttachmentPart]);

export type UserMessageAttachmentKind = Static<typeof UserMessageAttachmentKind>;
export type UserMessageAttachmentPart = Static<typeof UserMessageAttachmentPart>;
export type UserMessageTextPart = Static<typeof UserMessageTextPart>;
export type UserMessageReferenceKind = Static<typeof UserMessageReferenceKind>;
export type UserMessageReferencePart = Static<typeof UserMessageReferencePart>;
export type UserMessageContentPart = Static<typeof UserMessageContentPart>;
