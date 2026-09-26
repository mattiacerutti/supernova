/** A workspace folder the user has added to the sidebar. Persisted locally; the server has no notion of projects. */
export interface Project {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly addedAt: string;
  readonly pinned: boolean;
}
