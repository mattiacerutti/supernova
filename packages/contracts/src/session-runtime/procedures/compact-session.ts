import {z} from "zod";
import {struct} from "@supernova/contracts/runtime/schemas";
import {ModelReference} from "@supernova/contracts/sessions/schemas";

export const CompactSessionPayload = struct({
  modelReference: ModelReference,
  sessionId: z.string(),
});

export type CompactSessionPayload = z.infer<typeof CompactSessionPayload>;
