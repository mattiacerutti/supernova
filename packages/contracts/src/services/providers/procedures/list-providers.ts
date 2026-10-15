import {z} from "zod";
import {Provider} from "../schemas";

export const ProvidersListResult = z.array(Provider);

export type ProvidersListResult = z.infer<typeof ProvidersListResult>;
