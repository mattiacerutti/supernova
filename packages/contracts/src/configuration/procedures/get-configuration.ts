import {z} from "zod";
import {struct} from "@supernova/contracts/runtime/schemas";
import {Configuration} from "@supernova/contracts/configuration/schemas";

/** Omit projectPath to read global configuration only, regardless of the server's working directory. */
export const GetConfigurationPayload = struct({
  projectPath: z.string().min(1).optional(),
});

export const GetConfigurationResult = Configuration;

export type GetConfigurationPayload = z.infer<typeof GetConfigurationPayload>;
export type GetConfigurationResult = z.infer<typeof GetConfigurationResult>;
