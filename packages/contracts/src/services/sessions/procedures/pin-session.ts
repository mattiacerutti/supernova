import {z} from "zod";

export const PinSessionPayload = z.object({
  sessionId: z.string(),
  pinned: z.boolean(),
});

export type PinSessionPayload = z.infer<typeof PinSessionPayload>;
