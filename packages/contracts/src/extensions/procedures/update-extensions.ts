import {z} from "zod";
import {TaggedError} from "@supernova/contracts/runtime/schemas";

export const UpdateExtensionsPayload = z.void();

export const UpdateExtensionsResult = z.void();

/** A package could not be checked or installed; the message carries Pi's npm or git output. */
export class UpdateExtensionsError extends TaggedError("UpdateExtensionsError") {}

export type UpdateExtensionsPayload = z.infer<typeof UpdateExtensionsPayload>;
export type UpdateExtensionsResult = z.infer<typeof UpdateExtensionsResult>;
