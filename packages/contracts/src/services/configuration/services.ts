import type {Reference} from "@earendil-works/chord";
import {method, remote} from "@earendil-works/chord";
import type {GetConfigurationPayload, GetConfigurationResult} from "@supernova/contracts/services/configuration/procedures";
import {json, result, serverHost} from "@supernova/contracts/lib/protocol";

export const ConfigurationService = remote("supernova.configuration", {
  version: 1,
  params: {},
  hostAddress: serverHost,
  variants: {
    owner: {
      methods: {
        get: method(json<GetConfigurationPayload>(), result<GetConfigurationResult>()),
      },
    },
  },
});

export type ConfigurationService = Reference<typeof ConfigurationService>;
