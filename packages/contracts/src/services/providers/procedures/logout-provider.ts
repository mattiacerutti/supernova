import {z} from "zod";

export const ProviderLogoutPayload = z.object({
  providerId: z.string(),
});

export const ProviderLogoutResult = z.object({
  providerId: z.string(),
});

export type ProviderLogoutPayload = z.infer<typeof ProviderLogoutPayload>;
export type ProviderLogoutResult = z.infer<typeof ProviderLogoutResult>;
