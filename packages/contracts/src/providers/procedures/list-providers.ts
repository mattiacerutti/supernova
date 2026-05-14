import {Schema} from "effect";
import {Provider} from "../schemas";

export const ProvidersListPayload = Schema.Void;

export const ProvidersListResult = Schema.Array(Provider);

export class ProvidersListError extends Schema.TaggedErrorClass<ProvidersListError>()("ProvidersListError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type ProvidersListPayload = typeof ProvidersListPayload.Type;
export type ProvidersListResult = typeof ProvidersListResult.Type;
