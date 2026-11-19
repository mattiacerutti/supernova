import {obj, type Static} from "@earendil-works/chord";
import {ModelReference} from "@supernova/contracts/services/sessions/schemas";

export const CompactSessionPayload = obj({
  modelReference: ModelReference,
});

export type CompactSessionPayload = Static<typeof CompactSessionPayload>;
