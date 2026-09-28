import {Rpc} from "effect/unstable/rpc";
import {UpdateExtensionsError, UpdateExtensionsPayload, UpdateExtensionsResult} from "@supernova/contracts/extensions/procedures";

export const UpdateExtensionsRpc = Rpc.make("updateExtensions", {
  payload: UpdateExtensionsPayload,
  success: UpdateExtensionsResult,
  error: UpdateExtensionsError,
});

export const ExtensionRpcs = [UpdateExtensionsRpc] as const;
