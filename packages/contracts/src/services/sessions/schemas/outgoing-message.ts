import {z} from "zod";
import {ModelReference} from "./model";
import {UserMessageContentPart} from "./user-message";

/** A message the user sends to start a turn, whether in an existing session or as the first message of a new one. */
export const OutgoingMessage = z.object({
  captureCheckpoints: z.boolean().optional(),
  contentParts: z.array(UserMessageContentPart),
  modelReference: ModelReference,
});

export type OutgoingMessage = z.infer<typeof OutgoingMessage>;
