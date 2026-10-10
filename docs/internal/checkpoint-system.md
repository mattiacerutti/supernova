# Checkpoint System Architecture

## Purpose

Supernova checkpoints keep conversation navigation and workspace files at the same logical point in time.

The system coordinates two durable state models:

- The session's durable engine file, whose conversations hold the turns and whose `supernova.session` document holds each turn's checkpoints and how much of the branch is shown.
- App-owned shadow Git repositories, which store workspace file snapshots.

A checkpoint navigation succeeds only when the workspace restore completes before the shown turns change.

## Architecture overview

```mermaid
flowchart LR
  CLIENT[Web client] --> RPC[Agent RPC]
  RPC --> FEATURE[SessionRuntime]
  FEATURE --> RUNTIME[SessionWorker]
  RUNTIME --> PI[Session engine file]
  RUNTIME --> STORE[CheckpointStore]
  STORE --> MANIFESTS[Checkpoint manifests]
  STORE --> SHADOWS[Shadow Git repositories]
  SHADOWS -. object alternates .-> SOURCE[User Git object databases]
  SHADOWS --> WORKTREES[User worktrees]
```

The architecture is divided into four responsibilities:

| Subsystem              | Responsibility                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session orchestration  | Defines turn boundaries, resolves navigation targets, and commits conversation navigation only after workspace restoration.                         |
| Workspace coordination | Discovers repositories, persists manifests, and coordinates multi-repository capture, restore, cleanup, and maintenance.                            |
| Shadow Git storage     | Captures trees and performs comparison, conflict detection, selective restoration, verification, rollback, and garbage collection for one worktree. |
| Lifecycle integration  | Releases active runtimes before archival and removes session-owned manifests and refs afterward.                                                    |

## Core invariants

1. A turn record claiming coverage is written only after its workspace manifest is durable.
2. A checkpoint manifest is published only after every covered repository has a tree and private ref.
3. Workspace restoration completes and verifies before the shown turns change.
4. Restore mutates only paths changed between the current and target checkpoint trees.
5. The user's Git `HEAD`, branch, index, refs, and stash are never changed.
6. A direct child repository owns its subtree; a parent repository snapshot excludes that subtree.
7. Manual changes to affected paths cause restore to fail before mutation unless the caller forces it.
8. Checkpoint storage never writes refs, indexes, commits, or other metadata into the user's `.git` directory.
9. Client-facing checkpoint failures are generic, apart from the workspace-conflict error, and are not logged by the checkpoint boundary.

## Conversation checkpoint model

Each session file has one Session-scoped document, `supernova.session` (`pi/lib/session/session-state.ts`):

```ts
interface CheckpointRef {
  readonly checkpointId: string;
  /** The session that captured it; a fork inherits foreign ones. */
  readonly sessionId: string;
  readonly status: "captured" | "disabled" | "failed";
}

interface TurnRecord {
  readonly contentParts: UserMessageContentPart[];
  readonly capture: boolean;
  readonly before: CheckpointRef;
  readonly after?: CheckpointRef; // absent until the turn's run ends
}

type SessionState = {
  branch: number; // conversation holding every turn, undone ones included
  leaf?: number | null; // last shown entry of the branch; absent at its end, null when nothing is shown
  current?: CheckpointRef; // checkpoint the workspace last matched
  turns: Record<string, TurnRecord>; // keyed by the turn's user entry id
};
```

- A turn is a user entry with a turn record; its id is the user entry id.
- Undo, redo, and revert only move `leaf`; the branch keeps every turn, so redo shows its later turns again.
- Sending or compacting from an undone leaf first forks the branch at `leaf` (or starts an empty conversation when nothing is shown) and makes that the branch, which drops the redo path. The engine forks only when the agent acts again.
- Checkpoint boundaries are per turn, not per entry, so they need no position in the transcript.

### Checkpoint coverage

`status` records whether a boundary has a durable workspace manifest behind it.

| Status     | Meaning                                                        |
| ---------- | -------------------------------------------------------------- |
| `captured` | A manifest exists for `checkpointId`.                          |
| `failed`   | Capture failed. No manifest was published.                     |
| `disabled` | Checkpointing was off for this turn. No capture was attempted. |

Every turn records both boundaries regardless of coverage, so turn boundaries and
conversation navigation stay intact when no workspace state was captured.
Workspace restoration requires both the current and target boundary to be captured;
otherwise navigation moves the conversation alone and leaves files untouched.

Both boundaries are required because a selective restore needs both trees: the plan is the
delta between them, and the conflict check compares the worktree against the current tree.
With no current tree there is no delta to compute and no way to separate agent changes from
manual edits, so a captured target cannot be restored on its own.

### Crossing an uncovered boundary

Navigating across an uncovered boundary moves the conversation while the worktree stays
where the turn left it, so conversation position and workspace state diverge. That
divergence is not tracked, and it has two consequences on later navigation:

- The next restore between two captured boundaries compares the worktree against the current
  checkpoint tree. If the uncovered turns changed any path in that delta, the conflict check
  fails and the restore is refused until a new turn re-baselines the workspace.
- If the uncovered turns changed only unrelated paths, the restore proceeds and leaves a
  mixed workspace: the restored delta is reverted while the uncovered changes remain.

Both outcomes are the ordinary conflict semantics applied to a workspace that drifted from
its checkpoint. Neither is reported as an uncovered-boundary problem.

```mermaid
flowchart LR
  T1[Turn 1: before B1, after A1] --> T2[Turn 2: before B2, after A2]
  BRANCH[Branch conversation] --- T1
  BRANCH --- T2
  UNDO[leaf after undo: end of turn 1] -. shows .-> T1
```

Undo returns the workspace to the first hidden turn's before-turn checkpoint (keeping manual changes made before that turn was sent); redo and forward revert return it to the last shown turn's after-turn checkpoint. Undo, redo, and revert-to-message resolve different target entries, but all use the same workspace restore operation.

## Turn lifecycle

A successful turn has a checkpoint on both sides of provider work.

```mermaid
sequenceDiagram
  participant Client
  participant Send as sendMessage
  participant Store as CheckpointStore
  participant File as SessionFile
  participant Worker as SessionWorker

  Client->>Send: send message
  Send->>Store: capture before-turn checkpoint
  Send->>File: submit input
  File->>File: record the turn under its user entry
  File->>File: generation, tools (engine)
  File-->>Worker: run ended (view)
  Worker->>Store: capture after-turn checkpoint
  Worker->>File: record after-turn checkpoint
  Worker-->>Client: session.state (run ended)
```

`sendMessage()` captures the before-turn checkpoint, then submits the input; the engine places an idle session's input at once, and its turn record is written under the new user entry. When the run ends, the worker captures one after-turn checkpoint and records it on every turn that lacks one, including turns finished while the server was down.

Capture is best-effort. A failed capture marks that boundary `failed` and the turn continues: provider work still runs, the after-turn checkpoint is still recorded, and the turn still settles. The turn stays navigable, but navigation across that boundary does not restore files. Because the turn proceeds, a turn started from an undone checkpoint invalidates the redo path whether or not its capture succeeded.

A workspace with no discovered Git repositories still receives valid manifests with empty `repositories` arrays. Conversation undo, redo, and revert therefore continue to work without changing loose files.

## Repository discovery and identity

Discovery runs on every capture and at the beginning of every restore.

The store inspects:

1. The project root itself.
2. Each immediate child directory of the project root.

A candidate is accepted only when its canonical path is exactly the Git worktree root returned by `git rev-parse --show-toplevel`. Bare repositories and directories merely located inside another repository are not accepted as separate roots.

Each repository identity contains:

```ts
interface RepositoryIdentity {
  readonly root: string;
  readonly gitDir: string;
  readonly objectDir: string;
  readonly repositoryId: string;
}
```

`repositoryId` is the SHA-256 hash of the canonical worktree root, the canonical Git directory, and that directory's inode number and birth time. Paths distinguish linked worktrees that share objects, and the inode pair distinguishes a repository recreated in place: filesystems such as ext4 recycle freed inode numbers immediately, so the number alone can collide, while the birth time separates two lives of the same inode. Some filesystems cannot store a birth time and report the ctime in its place, which changes on ordinary Git activity; a birth time equal to the ctime is therefore treated as zero, falling back to inode-only identity instead of churning.

Discovered repositories are sorted by project-relative root. If a root repository contains a discovered direct child repository, the child root is excluded from the parent's capture and restore path set.

Discovery does not recurse below immediate children. Deeper repositories are not independently checkpointed, and restore refuses recursive deletion of any path containing nested `.git` metadata.

## Storage layout

Checkpoint data lives below the Pi agent data directory. By default this is:

```text
~/.supernova/userdata/agent/checkpoints/
```

When `PI_CODING_AGENT_DIR` is set, its value replaces `~/.supernova/userdata/agent`.

```text
<agent-data>/checkpoints/
  projects/
    <sha256-canonical-project-root>/
      repositories/
        <repository-id>/
          git/
            HEAD
            config
            objects/
              info/
                alternates
            refs/
              supernova/
                <sha256-session-id>/
                  <sha256-checkpoint-id>
      manifests/
        <sha256-session-id>/
          <sha256-checkpoint-id>.json
```

The exact physical ref representation may change after Git packs refs. The logical ref name is stored in the manifest.

### Shadow repositories

Each discovered user worktree has one bare, app-owned shadow repository. It:

- Stores new checkpoint objects and refs.
- Uses the user worktree as the command worktree.
- Uses the source repository's object directory through `objects/info/alternates`.
- Pins its prune window with `gc.pruneExpire=7.days` and leaves Git's automatic maintenance enabled.
- Applies `core.autocrlf=false`, `core.fsmonitor=false`, `core.longpaths=true`, and `core.symlinks=true` (`false` on Windows, where symlink creation requires elevation Git for Windows usually lacks) to checkpoint commands. Disabling the filesystem monitor keeps checkpoint commands from starting or consulting a daemon for the user's worktree, and keeps monitor state copied from the user's index from being trusted.

Capture and restore use temporary indexes under the operating-system temporary directory. Capture seeds its temporary index by copying the source index when available, then refreshes that private copy from the actual worktree. This reuses unchanged object IDs and filesystem metadata without introducing a shared mutable checkpoint index or application-level lock. Repositories without a source index fall back to an empty temporary index. The user's index is never used for writes, and temporary indexes are removed after each operation.

The shadow ref points directly to a Git tree; Supernova does not create checkpoint commits.

### Checkpoint manifests

One manifest maps a Pi checkpoint ID to the tree captured for every discovered repository.

```ts
interface RepositoryCheckpointState {
  readonly repositoryId: string;
  readonly relativeRoot: string;
  readonly treeId: string;
  readonly refName: string;
}

interface WorkspaceCheckpointManifest {
  readonly version: 1;
  readonly checkpointId: string;
  readonly sessionId: string;
  readonly projectRoot: string;
  readonly repositories: readonly RepositoryCheckpointState[];
}
```

Manifest files contain metadata only. File contents and modes live in Git objects.

```mermaid
flowchart LR
  ENTRY[Pi checkpoint entry] --> ID[checkpointId]
  ID --> MANIFEST[Workspace manifest]
  MANIFEST --> ROOT_TREE[Root repository tree]
  MANIFEST --> CHILD_TREE[Child repository tree]
  ROOT_TREE --> ROOT_REF[Private shadow ref]
  CHILD_TREE --> CHILD_REF[Private shadow ref]
```

Project, session, and checkpoint identifiers are hashed in storage paths. Manifests retain the original checkpoint ID, session ID, canonical project root, relative repository roots, tree IDs, and logical ref names.

Manifest loading validates:

- Manifest version.
- Requested checkpoint, session, and project ownership.
- Duplicate repository identities.
- Repository and tree hash formats.
- Expected session/checkpoint ref names.
- Project-relative repository paths.

Manifests are written atomically through a temporary sibling file followed by `rename()`.

## Capture

`CheckpointStore.capture()` captures one complete workspace checkpoint.

```mermaid
sequenceDiagram
  participant Send
  participant Store as CheckpointStore
  participant Shadow as Shadow Git storage
  participant Git
  participant Manifest

  Send->>Store: capture(projectRoot, sessionId, checkpointId)
  Store->>Store: canonicalize project and discover repositories
  loop each repository
    Store->>Shadow: open shadow repository
    Shadow->>Git: create source-seeded temporary index
    Shadow->>Git: refresh and add changed worktree paths
    Shadow->>Git: write-tree
    Shadow->>Git: update private checkpoint ref
    Shadow-->>Store: tree ID
  end
  Store->>Manifest: atomic write
  Store-->>Send: success
```

Repositories capture concurrently. Each owns a separate shadow repository and a private
temporary index, so no state is shared between them, and the project lock still serializes the
capture as a whole against other checkpoint work. For each repository, capture:

1. Creates a private temporary index.
2. Copies the source index when available, otherwise initializes an empty tree.
3. Removes discovered child repository roots owned by another snapshot.
4. Clears `skip-worktree` and `assume-unchanged` in the temporary copy, for the entries that carry them. Both flags stop Git from reporting worktree changes, so an unflagged copy is what makes capture see the real files. Only flagged entries are rewritten, which keeps the cost proportional to flagged files rather than to repository size and preserves the copied index's cached directory trees.
5. Reads changed tracked paths, staged deletions, and untracked, non-ignored paths in one status pass, which also refreshes cached index metadata against the actual worktree. Renames are disabled so a delete and add pair is never collapsed, and submodules are skipped so the pass never recurses into them.
6. Keeps tracked files regardless of size or ignore status.
7. Keeps untracked files and symlinks up to and including 2 MiB.
8. Skips ignored untracked files, untracked files above 2 MiB, directories, and missing paths.
9. Adds only changed, deleted, and eligible untracked paths with literal, NUL-delimited pathspecs.
10. Writes a complete controlled-worktree tree into the shadow object database.
11. Creates the session/checkpoint ref before publishing the manifest.

Tracked deletions are represented by absence from the newly built tree. Empty directories, ownership, ACLs, and extended attributes are not representable by Git trees.

If any repository capture or the manifest write fails, the manifest is not published. The store best-effort deletes refs already created for that incomplete checkpoint and propagates the failure.

## Restore

All navigation commands call:

```ts
restore({
  projectRoot,
  sessionId,
  fromCheckpointId,
  checkpointId,
});
```

The operation has three phases: preflight, apply, and conversation commit.

### Repository-set reconciliation

Restore loads the current and target manifests, rediscovers repositories, and matches entries by `repositoryId` plus `relativeRoot`.

| Relationship                                    | Behavior                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Present in current and target manifests         | Build a selective restore plan between the two trees.                                                              |
| Present only in the current manifest            | Leave it untouched. The target checkpoint made no claim about it.                                                  |
| Present only in the target manifest             | Require the repository to exist and already match the target tree; do not overwrite without a current source tree. |
| Required by target but missing or replaced      | Fail before mutation.                                                                                              |
| Newly discovered and absent from both manifests | Leave it untouched.                                                                                                |

Currently discovered child repositories are excluded from parent plans even when an older manifest predates the child. Restoring an old parent checkpoint therefore does not delete a repository added later.

Before planning mutations, restore verifies the available manifest refs resolve to their recorded trees.

### Restore plan and conflict detection

For a repository present in both manifests, the shadow layer diffs the current checkpoint tree against the target tree with rename detection disabled.

```ts
interface RepositoryRestorePlan {
  readonly deletePaths: readonly string[];
  readonly restorePaths: readonly string[];
  readonly affectedPaths: readonly string[];
  readonly repository: ShadowRepository;
  readonly safetyTreeId: string;
  readonly targetTreeId: string;
}
```

- Deleted paths exist in the current tree but not the target tree.
- Restore paths are added or modified in the target tree.
- Affected paths are the union of both sets.

The planner builds a safety tree by starting from the current checkpoint tree and replacing only affected paths with their actual worktree state. If that safety tree differs from the expected current tree, an affected path was manually changed and restore fails before mutation with a `CheckpointConflictError`.

Manual changes outside the affected path set are intentionally ignored and preserved.

### Forced restores

Navigation payloads accept `force`. A forced restore skips the safety-tree equality check and
overwrites the conflicting paths, which permanently discards those manual changes; nothing
pins the pre-force worktree state. `force` bypasses that single check and nothing else:
missing or invalid manifests, unresolvable refs, missing or replaced repositories, the nested
`.git` refusal, and post-apply verification all still fail.

Clients are expected to attempt navigation without `force`, and to retry with it only after
the user confirms discarding their changes in response to a `CheckpointConflictError`. The
conflict error names no paths, so the confirmation is a blanket acknowledgement rather than a
review of specific files. The workspace can also change between the refusal and the retry;
`force` discards whatever conflicts at the moment it runs.

### Applying and verifying

```mermaid
sequenceDiagram
  participant Nav as Navigation
  participant Store as CheckpointStore
  participant Shadow
  participant Worktree
  participant Pi

  Nav->>Store: restore current to target
  Store->>Store: load, discover, verify, and reconcile
  loop shared repository
    Store->>Shadow: build conflict-checked plan and safety tree
  end
  loop target-only repository
    Store->>Shadow: verify worktree already equals target tree
  end
  loop restore plan
    Store->>Shadow: apply target operations
    Shadow->>Worktree: remove affected paths
    Shadow->>Worktree: restore target paths
    Store->>Shadow: verify affected paths
  end
  alt all plans succeed
    Store-->>Nav: success
    Nav->>Pi: move the leaf to the target turn
  else a plan fails
    Store->>Shadow: best-effort rollback applied plans
    Store-->>Nav: failure
    Note over Nav,Pi: leaf unchanged
  end
```

Application removes both delete and restore paths before running `git restore --worktree`. Removing first handles file-to-directory and directory-to-file transitions.

Before recursive removal, the implementation:

- Rejects unsafe or escaping repository paths.
- Resolves and checks filesystem containment.
- Refuses to traverse a symbolic-link ancestor.
- Refuses to remove a path containing nested `.git` metadata.

Only restore paths are read back from the target tree. Delete paths remain absent.

Verification starts from the target tree, replaces affected paths with their actual post-restore worktree state, writes a verification tree, and requires its ID to equal the target tree ID. This verifies content, executable modes, symlinks, additions, and deletions for affected paths.

### Best-effort rollback

Each plan's safety tree records the actual affected-path state during preflight, before any plan is applied. If apply or verification fails, plans that may have been touched are processed in reverse order and restored from their safety trees.

Safety trees are not referenced after the restore call and are eventually eligible for Git pruning. Rollback protects ordinary in-process failures; it does not make multi-repository restore transactionally atomic or crash-safe.

### Conversation commit

`navigateToTurn()` calls `SessionWorker.restoreCheckpoint()` before changing the conversation, and only when both the current and target boundaries are captured. Only after restore succeeds, or is skipped because a boundary is uncovered, does it:

1. Move `leaf` to the target turn's last entry.
2. Record the restored checkpoint as `current`.
3. Publish the change to the session's state.

The model and thinking level come back with it: the session document reads the branch's `pi.agent` as of the leaf, and the fork a later send makes keeps that copy, so nothing is stored per turn.

A restore failure is converted to `Failed to restore workspace checkpoint.` The leaf does not change.

A forked session copies its source's turn records; their checkpoints keep the source's `sessionId`, so navigating to an inherited captured boundary rejects with `CheckpointInheritedError`.

## Git and filesystem preservation

| State                                           | Behavior                                      |
| ----------------------------------------------- | --------------------------------------------- |
| User `HEAD` and current branch                  | Preserved.                                    |
| User commits, branches, tags, refs, and reflogs | Preserved.                                    |
| User index and staged state                     | Preserved.                                    |
| Git stash                                       | Preserved.                                    |
| Paths in the current-to-target tree delta       | Restored or deleted after conflict checks.    |
| Paths outside that delta                        | Preserved.                                    |
| Ignored untracked files                         | Not captured and not restored.                |
| Untracked files through 2 MiB                   | Captured when inside a discovered repository. |
| Untracked files above 2 MiB                     | Not captured.                                 |
| Tracked files                                   | Captured without a size limit.                |
| Loose files outside discovered repositories     | Not captured or restored.                     |
| Empty directories                               | Not represented.                              |
| Executable mode and symlinks                    | Captured and restored.                        |
| Ownership, ACLs, and extended attributes        | Not represented.                              |
| Nested `.git` metadata                          | Never recursively deleted by restore.         |

## Errors

Checkpoint storage uses ordinary exceptions internally, except where the client must act on the failure: those are thrown as contract errors where they are detected.

- Capture failures are absorbed and recorded as a `failed` checkpoint boundary instead of failing the turn.
- A workspace conflict is thrown by the shadow repository as `CheckpointConflictError`, so clients can offer a forced retry. It carries a fixed message and no paths.
- Navigation throws `CheckpointUncapturedError` and `CheckpointInheritedError` itself when the target cannot be restored without `force`, or at all.
- Every other restore failure is a plain `Error` with `Failed to restore workspace checkpoint.`, which clients receive as a `GenericError`.
- Internal Git commands, paths, tree IDs, and manifest details are not sent to clients.
- Checkpoint failures are not logged by the checkpoint system.

`CheckpointNavigationError` is the union of those three contract errors and is the declared error for the undo, redo, and revert procedures.

The store uses `Promise<void>` rather than booleans so callers cannot accidentally treat a failed capture as a valid checkpoint. `SessionWorker.captureCheckpoint()` converts that rejection into a boundary status, which is the only place a capture failure is interpreted.

## Session archival and cleanup

Archiving a session follows this order:

1. The archive operation in `session-operations.ts` releases and disposes the session runtime.
2. The Pi session file moves into the archive directory.
3. `CheckpointStore.deleteSession()` runs as best-effort cleanup.

Session cleanup:

1. Loads that session's manifests.
2. Deletes each recorded session/checkpoint ref from its shadow repository.
3. Removes that session's manifest directory.
4. Leaves shared shadow repository directories in place.
5. Schedules maintenance if the daily interval has elapsed.

Cleanup never deletes another session's refs or automatically removes a shared shadow repository.

## Maintenance and retention

Shadow repositories keep Git's automatic maintenance enabled and pin the prune window in
their own configuration:

```sh
git config gc.pruneExpire 7.days
```

Local configuration takes precedence over the user's global configuration, so the prune
window is owned by the app even though the schedule is not. Git packs and prunes on its own
loose-object heuristic, triggered by the index writes capture already performs. Session
cleanup additionally runs an explicit pass so freeing a session reclaims promptly instead of
waiting for that heuristic:

```sh
git gc --prune=7.days
```

Properties of this policy:

- Trees reachable from retained session refs remain protected, so nothing expires while it is still referenced.
- Objects unique to deleted checkpoints become unreachable after ref deletion.
- Unreachable objects older than seven days may be reclaimed.
- A user's `gc.pruneExpire` or `gc.auto` cannot shorten the window or disable pinning, because local configuration wins.
- Fresh objects created before a capture ref is published have a seven-day safety window.
- Maintenance failures are ignored. Git records `gc.log` and pauses its own automatic maintenance after a failure, so a repeatedly failing repository stops being packed; storage then grows, but no history is lost.
- No application-level cleanup lock is used. Git takes its own lock, and automatic maintenance detaches rather than blocking capture.

There is no retention policy beyond ref deletion: refs live until their session is archived,
and nothing removes shadow repositories orphaned by a changed repository identity.

Objects available only through the source repository alternate remain dependent on the source repository retaining them. Rewriting source history followed by aggressive source GC can therefore make an old checkpoint incomplete even while its shadow ref remains.

## Concurrency and lifecycle

`SessionRuntime` keeps one `SessionWorker` per session in use. Navigation and compaction run one at a time per session and reject while a run is active, so a restore never races a turn's file changes.

- Session archival aborts the session's work, closes its file, then deletes its checkpoint refs.
- Runtime shutdown closes every session file without aborting work; an interrupted turn resumes, and gets its after-turn checkpoint, when its session next opens.

The checkpoint store serializes capture and restore per canonical project root with an
in-process keyed lock. Concurrent sessions in the same project queue instead of observing
each other mid-operation, so a capture never records a partially restored worktree and two
restores never interleave worktree mutations. Different projects remain fully concurrent,
and session cleanup is not serialized because ref deletion and manifest removal are
independent of worktree state.

The lock is process-local and project-scoped. It does not protect against a second
Supernova process, against two overlapping project roots that share one worktree, or
against agent tool writes that run outside checkpoint operations.

## Accepted limitations

- A process crash during restore can leave a partially restored workspace.
- Restore is not atomic across repositories.
- There is no startup restore journal or recovery pass.
- There is no cross-process lock, and agent tool writes are not serialized against checkpoint operations.
- Discovery includes only the project root and immediate child repositories.
- Loose files outside discovered repositories are ignored.
- Untracked files larger than 2 MiB are ignored; tracked files remain uncapped.
- Empty directories, ownership, ACLs, and extended attributes are not captured.
- On Windows, checkpoint commands run with `core.symlinks=false`, so a checkout that uses real symlinks has them captured by content and restored as regular files.
- Source object alternates make some checkpoint objects depend on source repository retention.
- Existing checkpoint data formerly stored in user repositories is not migrated or read.
- Uncovered checkpoint boundaries are not surfaced to clients, so a turn without workspace coverage looks like any other turn.
- There is no configurable storage budget or checkpoint-management UI.
