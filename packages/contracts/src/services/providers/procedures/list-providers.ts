import {arr, type Static} from "@earendil-works/chord";
import {Provider} from "@supernova/contracts/services/providers/schemas";

export const ProvidersListResult = arr(Provider);

export type ProvidersListResult = Static<typeof ProvidersListResult>;
