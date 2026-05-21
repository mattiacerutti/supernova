import {Schema} from "effect";

export const UserMessageAttachmentKind = Schema.Union([Schema.Literal("image"), Schema.Literal("text")]);

export const UserMessageAttachmentPart = Schema.Struct({
  contentBase64: Schema.optional(Schema.String),
  /** Stable client-generated attachment identifier. */
  id: Schema.String,
  kind: UserMessageAttachmentKind,
  /** Original file name selected by the user. */
  name: Schema.String,
  /** Attachment MIME type used by the backend and UI to interpret the file content. */
  mime: Schema.String,
  /** File size in bytes. */
  size: Schema.Number,
  type: Schema.Literal("attachment"),
});

export const UserMessageTextPart = Schema.Struct({
  text: Schema.String,
  type: Schema.Literal("text"),
});

export const UserMessageReferenceKind = Schema.Union([Schema.Literal("file"), Schema.Literal("skill")]);

export const UserMessageReferencePart = Schema.Struct({
  id: Schema.String,
  kind: UserMessageReferenceKind,
  name: Schema.String,
  type: Schema.Literal("reference"),
  value: Schema.String,
});

export const UserMessageContentPart = Schema.Union([UserMessageTextPart, UserMessageReferencePart, UserMessageAttachmentPart]);

/** User-authored message that starts a session turn. */
export const UserMessage = Schema.Struct({
  /** Stable message identifier. */
  id: Schema.String,
  /** Structured user-authored content, including references and attachments. */
  contentParts: Schema.Array(UserMessageContentPart),
  /** ISO timestamp for when the message was sent or created. */
  timestamp: Schema.optional(Schema.String),
});

export type UserMessageAttachmentKind = typeof UserMessageAttachmentKind.Type;
export type UserMessageAttachmentPart = typeof UserMessageAttachmentPart.Type;
export type UserMessageTextPart = typeof UserMessageTextPart.Type;
export type UserMessageReferenceKind = typeof UserMessageReferenceKind.Type;
export type UserMessageReferencePart = typeof UserMessageReferencePart.Type;
export type UserMessageContentPart = typeof UserMessageContentPart.Type;
export type UserMessage = typeof UserMessage.Type;
