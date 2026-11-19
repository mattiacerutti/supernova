import type {Reference} from "@earendil-works/chord";
import {method, nul, remote} from "@earendil-works/chord";
import {UpdateExtensionsError} from "@supernova/contracts/services/extensions/procedures";
import type {Errors} from "@supernova/contracts/lib/errors";
import {serverHost} from "@supernova/contracts/lib/protocol";

export const ExtensionsService = remote("supernova.extensions", {
  version: 2,
  params: {},
  hostAddress: serverHost,
  variants: {
    owner: {
      methods: {
        update: method(undefined, nul()),
      },
    },
  },
});

export const ExtensionsErrors = {
  update: UpdateExtensionsError,
} satisfies Errors<typeof ExtensionsService>;

export type ExtensionsService = Reference<typeof ExtensionsService>;
