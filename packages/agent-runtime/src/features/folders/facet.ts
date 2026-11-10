import type {Facet} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {FoldersService} from "@supernova/contracts/services/folders/services";
import {method} from "@supernova/agent-runtime/lib/chord/methods";
import {forbidden, isOwner} from "@supernova/agent-runtime/lib/chord/principals";
import type {Folders} from "@supernova/agent-runtime/features/folders/folders";

export function foldersFacet(folders: Folders): Facet<RuntimePrincipal> {
  return defineFacet<RuntimePrincipal>((host) => {
    host.serve(FoldersService, (_params, principal) => {
      if (!isOwner(principal)) throw forbidden("Only the owner browses folders.");

      return {
        variant: "owner",
        members: {
          create: method((input) => folders.create(input)),
          listSuggestions: method((input) => folders.listSuggestions(input)),
          listFiles: method((input) => folders.listFiles(input)),
        },
      };
    });
  });
}
