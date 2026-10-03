import {z} from "zod";
import {struct} from "@supernova/contracts/runtime/schemas";

export const AbortSessionPayload = struct({
  sessionId: z.string(),
});

export type AbortSessionPayload = z.infer<typeof AbortSessionPayload>;
