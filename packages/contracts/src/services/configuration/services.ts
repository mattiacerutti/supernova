import type {Context} from "@earendil-works/chord";
import {defineService} from "@earendil-works/chord";
import type {GetConfigurationPayload, GetConfigurationResult} from "@supernova/contracts/services/configuration/procedures";
import type {ServiceResult} from "@supernova/contracts/lib/protocol";

/** Effective configuration safe to expose to clients. */
export interface ConfigurationService {
  get(payload: GetConfigurationPayload, context: Context): Promise<ServiceResult<GetConfigurationResult>>;
}

export const ConfigurationService = defineService<ConfigurationService>("supernova.configuration");
