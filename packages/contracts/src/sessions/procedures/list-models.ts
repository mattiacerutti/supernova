import {Schema} from "effect";
import {ModelDetails} from "@supernova/contracts/sessions/schemas";

export const ListModelsPayload = Schema.Struct({projectPath: Schema.String});

/** Result payload for listing models available to session prompts. */
export const ListModelsResult = Schema.Array(ModelDetails);

export class ListModelsError extends Schema.TaggedErrorClass<ListModelsError>()("ListModelsError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type ListModelsPayload = typeof ListModelsPayload.Type;
export type ListModelsResult = typeof ListModelsResult.Type;
