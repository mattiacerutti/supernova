import {arr, bool, obj, opt, type Static} from "@earendil-works/chord";
import {ModelReference} from "@supernova/contracts/services/sessions/schemas";
import {UserMessageContentPart} from "./user-message";

export const OutgoingMessage = obj({
  captureCheckpoints: opt(bool()),
  contentParts: arr(UserMessageContentPart),
  modelReference: ModelReference,
});

export type OutgoingMessage = Static<typeof OutgoingMessage>;
