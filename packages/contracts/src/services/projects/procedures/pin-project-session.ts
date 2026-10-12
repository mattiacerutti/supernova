import {z} from "zod";

export const ProjectSessionPinPayload = z.object({
  sessionId: z.string(),
  pinned: z.boolean(),
});

export type ProjectSessionPinPayload = z.infer<typeof ProjectSessionPinPayload>;
