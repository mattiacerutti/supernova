import {z} from "zod";
import {array} from "@supernova/contracts/runtime/schemas";
import {Provider} from "../schemas";

export const ProvidersListPayload = z.void();

export const ProvidersListResult = array(Provider);

export type ProvidersListPayload = z.infer<typeof ProvidersListPayload>;
export type ProvidersListResult = z.infer<typeof ProvidersListResult>;
