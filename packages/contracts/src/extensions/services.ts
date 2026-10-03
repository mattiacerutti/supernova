import type {Context} from "@earendil-works/chord";
import {defineService} from "@earendil-works/chord";
import type {ServiceResult} from "@supernova/contracts/runtime/services";

/** Installed Pi extension packages. */
export interface ExtensionsService {
  /** Updates every package and reloads them in open sessions; a running call finishes on the code it took. */
  update(context: Context): Promise<ServiceResult<null>>;
}

export const ExtensionsService = defineService<ExtensionsService>("supernova.extensions");
