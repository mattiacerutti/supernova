import {z} from "zod";
import {Provider} from "../schemas";

export const ProvidersListPayload = z.void();

export const ProvidersListResult = z.array(Provider);

export type ProvidersListPayload = z.infer<typeof ProvidersListPayload>;
export type ProvidersListResult = z.infer<typeof ProvidersListResult>;
