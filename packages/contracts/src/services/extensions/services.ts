import type {Reference} from "@earendil-works/chord";
import {method, remote} from "@earendil-works/chord";
import type {UpdateExtensionsError} from "@supernova/contracts/services/extensions/procedures";
import {result, serverHost} from "@supernova/contracts/lib/protocol";

export const ExtensionsService = remote("supernova.extensions", {
  version: 1,
  params: {},
  hostAddress: serverHost,
  variants: {
    owner: {
      methods: {
        /** Updates every package and reloads them in open sessions; a running call finishes on the code it took. */
        update: method(undefined, result<null, UpdateExtensionsError>()),
      },
    },
  },
});

export type ExtensionsService = Reference<typeof ExtensionsService>;
