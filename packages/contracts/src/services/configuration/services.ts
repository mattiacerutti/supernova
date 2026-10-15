import type {MembersOf} from "@earendil-works/chord";
import {method, remote} from "@earendil-works/chord";
import type {GetConfigurationPayload, GetConfigurationResult} from "@supernova/contracts/services/configuration/procedures";
import {json, result, SERVER_WIDE} from "@supernova/contracts/lib/protocol";

export const ConfigurationService = remote("supernova.configuration", {
  version: 1,
  input: SERVER_WIDE,
  variants: {
    default: {
      methods: {
        get: method(json<GetConfigurationPayload>(), result<GetConfigurationResult>()),
      },
    },
  },
});

export type ConfigurationService = MembersOf<typeof ConfigurationService>;
