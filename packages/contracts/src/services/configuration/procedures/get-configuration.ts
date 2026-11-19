import {obj, opt, type Static, str} from "@earendil-works/chord";
import {Configuration} from "@supernova/contracts/services/configuration/schemas";

export const GetConfigurationPayload = obj({
  /** Absent: global configuration only, whatever the server's working directory. */
  projectPath: opt(str({min: 1})),
});

export const GetConfigurationResult = Configuration;

export type GetConfigurationPayload = Static<typeof GetConfigurationPayload>;
export type GetConfigurationResult = Static<typeof GetConfigurationResult>;
