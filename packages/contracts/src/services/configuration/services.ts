import type {Reference} from "@earendil-works/chord";
import {method, remote} from "@earendil-works/chord";
import type {GetConfigurationResult} from "@supernova/contracts/services/configuration/procedures";
import {GetConfigurationPayload} from "@supernova/contracts/services/configuration/procedures";
import {json, serverHost} from "@supernova/contracts/lib/protocol";

export const ConfigurationService = remote("supernova.configuration", {
  version: 3,
  params: {},
  hostAddress: serverHost,
  variants: {
    owner: {
      methods: {
        get: method(GetConfigurationPayload, json<GetConfigurationResult>()),
      },
    },
  },
});

export type ConfigurationService = Reference<typeof ConfigurationService>;
