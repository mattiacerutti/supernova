import type {Facet} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {FoldersService} from "@supernova/contracts/services/folders/services";
import {createFolder, listFolderFiles, listFolderSuggestions} from "@supernova/agent-runtime/features/folders/folders";
import {method} from "@supernova/agent-runtime/lib/chord/methods";
import {forbidden, isOwner} from "@supernova/agent-runtime/lib/chord/principals";

export const foldersFacet: Facet<RuntimePrincipal> = defineFacet<RuntimePrincipal>((host) => {
  host.serve(FoldersService, (_params, principal) => {
    if (!isOwner(principal)) throw forbidden("Only the owner browses folders.");

    return {
      variant: "owner",
      members: {
        create: method((input) => createFolder(input)),
        listSuggestions: method((input) => listFolderSuggestions(input)),
        listFiles: method((input) => listFolderFiles(input)),
      },
    };
  });
});
