import {local, method, nul} from "@earendil-works/chord";

export const ExtensionsStore = local("supernova.store.extensions", {version: 1, params: {}, members: {update: method(undefined, nul())}});
