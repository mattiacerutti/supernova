import {z} from "zod";
import {struct} from "@supernova/contracts/runtime/schemas";

export const ProviderLogoutPayload = struct({
  providerId: z.string(),
});

export const ProviderLogoutResult = struct({
  providerId: z.string(),
});

export type ProviderLogoutPayload = z.infer<typeof ProviderLogoutPayload>;
export type ProviderLogoutResult = z.infer<typeof ProviderLogoutResult>;
