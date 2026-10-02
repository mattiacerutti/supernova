import {z} from "zod";
import {array, struct} from "@supernova/contracts/runtime/schemas";
import {ModelReference} from "./model";
import {UserMessageContentPart} from "./user-message";

/** A message the user sends to start a turn, whether in an existing session or as the first message of a new one. */
export const OutgoingMessage = struct({
  captureCheckpoints: z.boolean().optional(),
  contentParts: array(UserMessageContentPart),
  modelReference: ModelReference,
});

export type OutgoingMessage = z.infer<typeof OutgoingMessage>;
