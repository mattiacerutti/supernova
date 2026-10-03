import {z} from "zod";
import {struct} from "@supernova/contracts/runtime/schemas";

export const GetSessionPayload = struct({
  sessionId: z.string(),
});

export type GetSessionPayload = z.infer<typeof GetSessionPayload>;
