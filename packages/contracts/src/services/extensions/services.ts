import type {MembersOf} from "@earendil-works/chord";
import {method, remote} from "@earendil-works/chord";
import type {UpdateExtensionsError} from "@supernova/contracts/services/extensions/procedures";
import {NO_PAYLOAD, result, SERVER_WIDE} from "@supernova/contracts/lib/protocol";

export const ExtensionsService = remote("supernova.extensions", {
  version: 1,
  input: SERVER_WIDE,
  variants: {
    default: {
      methods: {
        /** Updates every package and reloads them in open sessions; a running call finishes on the code it took. */
        update: method(NO_PAYLOAD, result<null, UpdateExtensionsError>()),
      },
    },
  },
});

export type ExtensionsService = MembersOf<typeof ExtensionsService>;
