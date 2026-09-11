import {Schema} from "effect";
import {Configuration} from "@supernova/contracts/configuration/schemas";

/** Omit projectPath to read global configuration only, regardless of the server's working directory. */
export const GetConfigurationPayload = Schema.Struct({
  projectPath: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
});

export const GetConfigurationResult = Configuration;

/** Configuration could not be read or validated. File contents are never included in this error. */
export class GetConfigurationError extends Schema.TaggedErrorClass<GetConfigurationError>()("GetConfigurationError", {
  message: Schema.String,
}) {}

export type GetConfigurationPayload = typeof GetConfigurationPayload.Type;
export type GetConfigurationResult = typeof GetConfigurationResult.Type;
