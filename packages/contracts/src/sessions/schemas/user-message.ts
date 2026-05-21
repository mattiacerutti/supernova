import {Schema} from "effect";

export const SessionUserMessageAttachmentKind = Schema.Union([Schema.Literal("image"), Schema.Literal("text")]);

export const SessionUserMessageAttachmentPart = Schema.Struct({
  contentBase64: Schema.optional(Schema.String),
  /** Stable client-generated attachment identifier. */
  id: Schema.String,
  kind: SessionUserMessageAttachmentKind,
  /** Original file name selected by the user. */
  name: Schema.String,
  /** Attachment MIME type used by the backend and UI to interpret the file content. */
  mime: Schema.String,
  /** File size in bytes. */
  size: Schema.Number,
  type: Schema.Literal("attachment"),
});

export const SessionUserMessageTextContentPart = Schema.Struct({
  text: Schema.String,
  type: Schema.Literal("text"),
});

export const SessionUserMessageReferenceKind = Schema.Union([Schema.Literal("file"), Schema.Literal("skill")]);

export const SessionUserMessageReferencePart = Schema.Struct({
  id: Schema.String,
  kind: SessionUserMessageReferenceKind,
  name: Schema.String,
  type: Schema.Literal("reference"),
  value: Schema.String,
});

export const SessionUserMessageContentPart = Schema.Union([SessionUserMessageTextContentPart, SessionUserMessageReferencePart, SessionUserMessageAttachmentPart]);

/** User-authored message that starts a session turn. */
export const SessionUserMessage = Schema.Struct({
  /** Stable message identifier. */
  id: Schema.String,
  /** Structured user-authored content, including references and attachments. */
  contentParts: Schema.Array(SessionUserMessageContentPart),
  /** ISO timestamp for when the message was sent or created. */
  timestamp: Schema.optional(Schema.String),
});

export type SessionUserMessageAttachmentKind = typeof SessionUserMessageAttachmentKind.Type;
export type SessionUserMessageAttachmentPart = typeof SessionUserMessageAttachmentPart.Type;
export type SessionUserMessageTextContentPart = typeof SessionUserMessageTextContentPart.Type;
export type SessionUserMessageReferenceKind = typeof SessionUserMessageReferenceKind.Type;
export type SessionUserMessageReferencePart = typeof SessionUserMessageReferencePart.Type;
export type SessionUserMessageContentPart = typeof SessionUserMessageContentPart.Type;
export type SessionUserMessage = typeof SessionUserMessage.Type;
