import {z} from "zod";
import {struct, TaggedError} from "@supernova/contracts/runtime/schemas";
import {ProviderLoginSession} from "../schemas";

export const ProviderLoginAuthType = z.union([z.literal("api_key"), z.literal("oauth")]);

export const ProviderLoginStartPayload = struct({
  authType: ProviderLoginAuthType,
  providerId: z.string(),
});

export const ProviderLoginInputSubmitPayload = struct({
  input: z.string(),
  loginSessionId: z.string(),
});

export const ProviderLoginCancelPayload = struct({
  loginSessionId: z.string(),
});

export const ProviderLoginWatchPayload = struct({
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
