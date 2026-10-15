import {z} from "zod";
import {ModelDetails} from "@supernova/contracts/services/sessions/schemas";

export const ListModelsPayload = z.object({projectPath: z.string()});

export const ListModelsResult = z.array(ModelDetails);

export type ListModelsPayload = z.infer<typeof ListModelsPayload>;
export type ListModelsResult = z.infer<typeof ListModelsResult>;
