import {z} from "zod";

export const SessionIdPayload = z.object({
  sessionId: z.string(),
});

export type SessionIdPayload = z.infer<typeof SessionIdPayload>;
