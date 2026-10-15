import type {MembersOf} from "@earendil-works/chord";
import {method, remote} from "@earendil-works/chord";
import type {
  ProjectSessionArchiveError,
  ProjectSessionArchivePayload,
  ProjectSessionArchiveResult,
  ProjectSessionPinPayload,
  ProjectSessionsListPayload,
  ProjectSessionsListResult,
  ProjectSessionsSearchPayload,
  ProjectSessionsSearchResult,
} from "@supernova/contracts/services/projects/procedures";
import {json, result, SERVER_WIDE} from "@supernova/contracts/lib/protocol";

export const ProjectsService = remote("supernova.projects", {
  version: 1,
  input: SERVER_WIDE,
  variants: {
    default: {
      methods: {
        listSessions: method(json<ProjectSessionsListPayload>(), result<ProjectSessionsListResult>()),
        searchSessions: method(json<ProjectSessionsSearchPayload>(), result<ProjectSessionsSearchResult>()),
        pinSession: method(json<ProjectSessionPinPayload>(), result<null>()),
        /** Archives a session: its shells close, its work stops, it leaves the listing, and its worktree goes when asked. */
        archiveSession: method(json<ProjectSessionArchivePayload>(), result<ProjectSessionArchiveResult, ProjectSessionArchiveError>()),
      },
    },
  },
});

export type ProjectsService = MembersOf<typeof ProjectsService>;
