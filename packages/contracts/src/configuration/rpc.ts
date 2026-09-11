import {Rpc} from "effect/unstable/rpc";
import {GetConfigurationError, GetConfigurationPayload, GetConfigurationResult} from "@supernova/contracts/configuration/procedures";

export const GetConfigurationRpc = Rpc.make("getConfiguration", {
  payload: GetConfigurationPayload,
  success: GetConfigurationResult,
  error: GetConfigurationError,
});

export const ConfigurationRpcs = [GetConfigurationRpc] as const;
