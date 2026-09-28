import {Schema} from "effect";

export const UpdateExtensionsPayload = Schema.Void;

export const UpdateExtensionsResult = Schema.Void;

/** A package could not be checked or installed; the message carries Pi's npm or git output. */
export class UpdateExtensionsError extends Schema.TaggedErrorClass<UpdateExtensionsError>()("UpdateExtensionsError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type UpdateExtensionsPayload = typeof UpdateExtensionsPayload.Type;
export type UpdateExtensionsResult = typeof UpdateExtensionsResult.Type;
