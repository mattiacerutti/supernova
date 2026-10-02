import {z} from "zod";
import {struct} from "@supernova/contracts/runtime/schemas";

export const UserMessageAttachmentKind = z.union([z.literal("image"), z.literal("text")]);

export const UserMessageAttachmentPart = struct({
  contentBase64: z.string().optional(),
  /** Stable client-generated attachment identifier. */
  id: z.string(),
  kind: UserMessageAttachmentKind,
  /** Original file name selected by the user. */
  name: z.string(),
  /** Attachment MIME type used by the backend and UI to interpret the file content. */
  mime: z.string(),
  /** File size in bytes. */
  size: z.number(),
  type: z.literal("attachment"),
});

export const UserMessageTextPart = struct({
  text: z.string(),
  type: z.literal("text"),
});

export const UserMessageReferenceKind = z.union([z.literal("file"), z.literal("skill")]);

export const UserMessageReferencePart = struct({
  id: z.string(),
  kind: UserMessageReferenceKind,
  name: z.string(),
  type: z.literal("reference"),
  value: z.string(),
});

export const UserMessageContentPart = z.union([UserMessageTextPart, UserMessageReferencePart, UserMessageAttachmentPart]);

export type UserMessageAttachmentKind = z.infer<typeof UserMessageAttachmentKind>;
export type UserMessageAttachmentPart = z.infer<typeof UserMessageAttachmentPart>;
export type UserMessageTextPart = z.infer<typeof UserMessageTextPart>;
export type UserMessageReferenceKind = z.infer<typeof UserMessageReferenceKind>;
export type UserMessageReferencePart = z.infer<typeof UserMessageReferencePart>;
export type UserMessageContentPart = z.infer<typeof UserMessageContentPart>;
