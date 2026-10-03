import {z} from "zod";
import {array, struct} from "@supernova/contracts/runtime/schemas";
import {ModelDetails} from "@supernova/contracts/sessions/schemas";

export const ListModelsPayload = struct({projectPath: z.string()});

/** Result payload for listing models available to session prompts. */
export const ListModelsResult = array(ModelDetails);

export type ListModelsPayload = z.infer<typeof ListModelsPayload>;
export type ListModelsResult = z.infer<typeof ListModelsResult>;
