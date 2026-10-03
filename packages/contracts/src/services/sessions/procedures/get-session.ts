import {z} from "zod";

export const GetSessionPayload = z.object({
  sessionId: z.string(),
});

export type GetSessionPayload = z.infer<typeof GetSessionPayload>;
