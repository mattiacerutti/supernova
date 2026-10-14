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

/** Sessions as they are listed under a project. */
export const ProjectsService = remote("supernova.projects", {
  version: 1,
  input: SERVER_WIDE,
  variants: {
    default: {
      methods: {
        /** One page of a project's sessions, pinned first, then newest. */
        listSessions: method(json<ProjectSessionsListPayload>(), result<ProjectSessionsListResult>()),
        /** One page of sessions across projects whose title matches, newest first. */
        searchSessions: method(json<ProjectSessionsSearchPayload>(), result<ProjectSessionsSearchResult>()),
        /** Pins or unpins a session in its project's listing. */
        pinSession: method(json<ProjectSessionPinPayload>(), result<null>()),
        /** Archives a session: its shells close, its work stops, it leaves the listing, and its worktree goes when asked. */
        archiveSession: method(json<ProjectSessionArchivePayload>(), result<ProjectSessionArchiveResult, ProjectSessionArchiveError>()),
      },
    },
  },
});

export type ProjectsService = MembersOf<typeof ProjectsService>;
