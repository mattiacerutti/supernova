import {z} from "zod";
import {ModelReference} from "@supernova/contracts/services/sessions/schemas";

export const CompactSessionPayload = z.object({
  modelReference: ModelReference,
  sessionId: z.string(),
});

export type CompactSessionPayload = z.infer<typeof CompactSessionPayload>;
