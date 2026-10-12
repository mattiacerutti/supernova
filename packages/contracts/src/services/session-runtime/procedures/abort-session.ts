import {z} from "zod";

export const AbortSessionPayload = z.object({
  sessionId: z.string(),
});

export type AbortSessionPayload = z.infer<typeof AbortSessionPayload>;
