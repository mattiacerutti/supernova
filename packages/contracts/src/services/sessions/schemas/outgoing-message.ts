import {z} from "zod";
import {ModelReference} from "./model";
import {UserMessageContentPart} from "./user-message";

export const OutgoingMessage = z.object({
  captureCheckpoints: z.boolean().optional(),
  contentParts: z.array(UserMessageContentPart),
  modelReference: ModelReference,
});

export type OutgoingMessage = z.infer<typeof OutgoingMessage>;
