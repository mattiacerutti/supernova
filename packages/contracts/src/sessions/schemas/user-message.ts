import {Schema} from "effect";

/** Serializable attachment persisted with a user-authored message. Content bytes are not included. */
export const SessionAttachment = Schema.Struct({
  /** Stable client-generated attachment identifier. */
  id: Schema.String,
  /** Original file name selected by the user. */
  name: Schema.String,
  /** Attachment MIME type used by the backend and UI to interpret the file content. */
  mime: Schema.String,
  /** File size in bytes. */
  size: Schema.Number,
  /** Optional base64 encoded original file bytes, used when the transcript can render attachment content locally. */
  contentBase64: Schema.optional(Schema.String),
});

export const SessionUserMessageTextContentPart = Schema.Struct({
  text: Schema.String,
  type: Schema.Literal("text"),
});

export const SessionUserMessageReferenceKind = Schema.Union([Schema.Literal("file"), Schema.Literal("skill")]);

export const SessionUserMessageReferencePart = Schema.Struct({
  id: Schema.String,
  kind: SessionUserMessageReferenceKind,
  subtitle: Schema.optional(Schema.String),
  title: Schema.String,
  type: Schema.Literal("reference"),
  value: Schema.String,
});

export const SessionUserMessageContentPart = Schema.Union([SessionUserMessageTextContentPart, SessionUserMessageReferencePart]);

/** User-authored message that starts a session turn. */
export const SessionUserMessage = Schema.Struct({
  /** Stable message identifier. */
  id: Schema.String,
  /** Client files attached to this user message. Content bytes are not persisted here. */
  attachments: Schema.optional(Schema.Array(SessionAttachment)),
  /** User-authored text content. */
  content: Schema.String,
  /** Optional structured render snapshot for selected inline user-message items. */
  contentParts: Schema.optional(Schema.Array(SessionUserMessageContentPart)),
  /** ISO timestamp for when the message was sent or created. */
  timestamp: Schema.optional(Schema.String),
});

export type SessionAttachment = typeof SessionAttachment.Type;
export type SessionUserMessageTextContentPart = typeof SessionUserMessageTextContentPart.Type;
export type SessionUserMessageReferenceKind = typeof SessionUserMessageReferenceKind.Type;
export type SessionUserMessageReferencePart = typeof SessionUserMessageReferencePart.Type;
export type SessionUserMessageContentPart = typeof SessionUserMessageContentPart.Type;
export type SessionUserMessage = typeof SessionUserMessage.Type;
