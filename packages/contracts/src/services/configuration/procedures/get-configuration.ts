import {z} from "zod";
import {Configuration} from "@supernova/contracts/services/configuration/schemas";

/** Omit projectPath to read global configuration only, regardless of the server's working directory. */
export const GetConfigurationPayload = z.object({
  projectPath: z.string().min(1).optional(),
});

export const GetConfigurationResult = Configuration;

export type GetConfigurationPayload = z.infer<typeof GetConfigurationPayload>;
export type GetConfigurationResult = z.infer<typeof GetConfigurationResult>;
