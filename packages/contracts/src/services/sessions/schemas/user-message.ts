import {z} from "zod";

export const UserMessageAttachmentKind = z.union([z.literal("image"), z.literal("text")]);

export const UserMessageAttachmentPart = z.object({
  /** Sent with the message; absent in the stored turn, whose image lives in Pi's user entry. */
  contentBase64: z.string().optional(),
  id: z.string(),
  kind: UserMessageAttachmentKind,
  name: z.string(),
  mime: z.string(),
  size: z.number(),
  type: z.literal("attachment"),
});

export const UserMessageTextPart = z.object({
  text: z.string(),
  type: z.literal("text"),
});

export const UserMessageReferenceKind = z.union([z.literal("file"), z.literal("skill")]);

export const UserMessageReferencePart = z.object({
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
