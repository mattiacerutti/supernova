import {z} from "zod";
import {TaggedError} from "@supernova/contracts/lib/errors";
import {ProviderLoginSession} from "../schemas";

export const ProviderLoginAuthType = z.union([z.literal("api_key"), z.literal("oauth")]);

export const ProviderLoginStartPayload = z.object({
  authType: ProviderLoginAuthType,
  providerId: z.string(),
});

export const ProviderLoginInputSubmitPayload = z.object({
  input: z.string(),
  loginSessionId: z.string(),
});

export const ProviderLoginCancelPayload = z.object({
  loginSessionId: z.string(),
});

export const ProviderLoginWatchPayload = z.object({
  loginSessionId: z.string(),
});

export const ProviderLoginResult = ProviderLoginSession;

export class ProviderLoginError extends TaggedError("ProviderLoginError") {}

export type ProviderLoginAuthType = z.infer<typeof ProviderLoginAuthType>;
export type ProviderLoginStartPayload = z.infer<typeof ProviderLoginStartPayload>;
export type ProviderLoginInputSubmitPayload = z.infer<typeof ProviderLoginInputSubmitPayload>;
export type ProviderLoginCancelPayload = z.infer<typeof ProviderLoginCancelPayload>;
export type ProviderLoginWatchPayload = z.infer<typeof ProviderLoginWatchPayload>;
export type ProviderLoginResult = z.infer<typeof ProviderLoginResult>;
