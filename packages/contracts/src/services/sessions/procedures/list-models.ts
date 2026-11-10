import {arr, obj, type Static, str} from "@earendil-works/chord";
import {ModelDetails} from "@supernova/contracts/services/sessions/schemas";

export const ListModelsPayload = obj({projectPath: str()});

export const ListModelsResult = arr(ModelDetails);

export type ListModelsPayload = Static<typeof ListModelsPayload>;
export type ListModelsResult = Static<typeof ListModelsResult>;
