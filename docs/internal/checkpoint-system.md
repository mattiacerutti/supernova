# Checkpoint system

## Purpose and ownership

Supernova checkpoints coordinate conversation navigation with workspace recovery without taking over the user's Git workflow. The durable session records turn boundaries and the shown conversation position; app-owned shadow Git repositories hold workspace snapshots. When navigation restores files, restoration must complete before the shown turns change.

The boundaries are deliberate:

- Session orchestration chooses turn boundaries and commits conversation navigation.
- The [checkpoint store](../../packages/agent-runtime/src/features/session-runtime/checkpoints/checkpoint-store.ts) coordinates repository discovery, manifests, capture, restore, and cleanup.
- The [shadow repository](../../packages/agent-runtime/src/features/session-runtime/checkpoints/shadow-repository.ts) owns Git snapshots, conflict detection, selective restoration, and verification for one worktree.

Read those implementations for formats and Git plumbing. This guide owns preservation guarantees, recovery policy, and the limits contributors must not overlook.

## Core invariants

1. Claim coverage only after the manifest and every covered repository's tree and private ref are durable. A failed capture must never look successful.
2. Finish and verify workspace restoration before committing conversation navigation. A failed restore leaves the conversation position unchanged.
3. Restore only paths changed between the current and target checkpoint trees; preserve unrelated manual edits.
4. Preserve the user's `HEAD`, branch, index, refs, reflogs, and stash. Checkpoint objects, refs, and temporary indexes stay app-owned, outside the user's `.git`.
5. A direct child repository owns its subtree. Parent capture and restore must exclude it, including when it appeared after the checkpoint.
6. Detect manual changes to affected paths before mutation unless the caller explicitly forces the restore.
7. Validate ownership, repository identity, refs, and filesystem containment. Never traverse symlink ancestors or recursively delete nested Git metadata.
8. Keep actionable refusals distinct from generic failures without exposing private Git commands or storage details.

## Conversation navigation

Checkpoint boundaries belong to turns, not individual transcript entries. Undo, redo, and revert move the shown position while retaining later turns for redo. Sending or compacting from an undone position forks there and replaces the redo path; merely navigating does not fork.

Undo targets the first hidden turn's **before** checkpoint, preserving manual edits made before that turn was sent. Redo and forward revert target the last shown turn's **after** checkpoint. Keep all three commands on the shared [navigation path](../../packages/agent-runtime/src/features/session-runtime/worker/lib/navigate-to-turn.ts), so they cannot acquire different restore checks.

Navigation also restores the model and thinking state associated with the shown conversation. A later send must fork from that state, not silently reuse the abandoned branch's settings.

A fork inherits conversation history, not ownership of its source session's workspace snapshots. Checkpoint references retain their capturing session's identity; inherited captured boundaries cannot restore files, even with force.

### Checkpoint coverage

A boundary is `captured` only when it has a durable manifest. `disabled` means no capture was attempted; `failed` means capture was attempted but no manifest was published. Conversation boundaries remain valid without workspace coverage.

- **Uncovered target:** move the conversation alone and leave files untouched. Do not imply that transcript movement proves file recovery.
- **Captured current and target:** restore their delta, checking affected paths against the current tree.
- **Captured target without a captured current baseline:** refuse unless forced. Without the baseline, there is no reliable way to distinguish uncaptured agent changes from manual edits. The forced path captures the live workspace as its baseline, then uses normal planning and verification; it can discard uncaptured work.

Conversation-only navigation can therefore leave files and transcript at different logical points. A later file restore must still honor coverage and conflict checks. Selective restoration intentionally permits unrelated manual changes to remain beside restored files.

## Capture

With checkpointing enabled, capture is attempted before submission and after the run ends. Settlement catches up on missing after-turn boundaries when a session is reopened, including runs that finished while nothing watched them.

Capture is best-effort: failure marks the boundary uncovered but must not block provider work or erase conversation history. A turn started from an undone position still invalidates redo even if its capture fails. A workspace without discovered repositories can have a valid empty manifest; that does not protect loose files.

Capture must describe the actual worktree, not the staged version. Reusing a copy of the user's index is an optimization, never permission to write to it. Clear `skip-worktree` and `assume-unchanged` flags in the private copy so they cannot hide real changes. Preserve literal path handling, staged deletions, modes, and file/directory transitions; do not collapse paths through rename detection or recurse into separately owned repositories.

Publish the manifest only after every repository's private ref exists. On partial failure, leave no successful coverage claim and best-effort remove refs created for that incomplete capture.

### Coverage limits

- Discover the project root and immediate child Git worktree roots, not arbitrary descendants or directories merely inside another repository. Bare repositories and loose files outside discovered roots are not covered.
- Capture tracked files without a size limit. Ignore untracked files excluded by Git and untracked files above the capture size limit; check the source policy before claiming a file is protected.
- Git trees represent file content, executable mode, and symlinks, not empty directories, ownership, ACLs, or extended attributes.
- Windows checkpoint commands cannot assume permission to create real symlinks. With `core.symlinks=false`, a real-symlink checkout does not round-trip as it does on other platforms.

Repository identity must distinguish linked worktrees and repositories recreated at the same path. Inodes alone can be reused, while a filesystem's reported creation time may actually be mutable ctime. Keep those filesystem quirks in mind before simplifying identity checks; the implementation documents the fallback.

## Restore

Restore is a preflight/apply/commit operation, not a whole-worktree reset.

### Preflight and repository changes

Validate manifest version and ownership, safe relative paths, unique repository identities, and refs resolving to their recorded trees. Rediscover repositories rather than trusting an old manifest's paths.

- Repositories in both manifests receive a selective restore plan.
- A repository only in the current manifest is untouched: the target made no claim about it.
- A repository only in the target must exist and already match its target tree. Do not overwrite it without a current source tree.
- A required target repository that is missing or replaced fails the operation before mutation.
- Newly discovered repositories absent from both manifests are untouched, and child roots remain excluded from parent plans.

Build all plans and detect conflicts before applying changes. The safety snapshot records the actual affected-path state, not just the expected checkpoint state; this is what allows rollback after ordinary failures.

### Conflicts and force

Compare the worktree against the current tree only on paths in the restore delta. Changes there are conflicts; manual edits outside that delta are preserved. Do not broaden the comparison into a requirement that the entire workspace be clean.

Clients attempt normal navigation first. A forced retry requires consent to discard manual or uncaptured changes, including an explicit preference to skip confirmation. Force can bypass conflicts or establish an uncovered baseline; it does not bypass ownership, repository, ref, path, nested `.git`, or verification checks. It cannot make an inherited checkpoint restorable.

The conflict response does not enumerate paths, and the workspace can change between refusal and retry. Confirmation is therefore a blanket acknowledgement of the state when the retry runs. Rollback snapshots are not a user-facing undo history: do not promise recovery of discarded edits.

### Apply, verify, then commit

Handle additions, deletions, executable modes, symlinks, and file/directory transitions. Check containment and symlink ancestors before destructive operations, and refuse recursive removal containing nested `.git` metadata.

Verify the actual affected-path result against the target tree before moving the conversation. If application or verification fails, attempt rollback of every possibly touched plan in reverse order using its safety snapshot. Leave the conversation position unchanged and report failure.

Rollback protects ordinary in-process failures; it is **not** a transaction across repositories or crash recovery. A crash can leave a partially restored workspace, and there is no startup restore journal. Do not describe this as atomic recovery.

## Errors

Throw expected refusal types where detected:

- `CheckpointConflictError`: affected paths contain manual changes.
- `CheckpointUncapturedError`: a captured target has no captured current baseline.
- `CheckpointInheritedError`: the target snapshot belongs to the source of a fork.

Other restore failures receive the generic restore message, without internal commands, paths, tree IDs, or manifest details. Capture failures become boundary status rather than failing the turn. Keep the store's failure result unambiguous; callers must not mistake a failed operation for valid coverage.

## Lifecycle, concurrency, and retention

Navigation and compaction reject while that session has active work. Capture and restore are also serialized per canonical project root, so two checkpoint operations cannot interleave mutations or capture a partially restored tree. Different projects remain concurrent.

That lock is process-local and project-scoped. It does not exclude external edits, tool writes from other sessions, another server, or overlapping project roots. Do not infer workspace-wide isolation from checkpoint serialization.

Archival stops work and releases the runtime before deleting session-owned checkpoint refs and manifests; it archives rather than deletes the conversation file. Ordinary shutdown closes storage without aborting work, allowing recovery when the session next opens. Cleanup is best-effort and must never remove another session's refs or shared shadow repositories.

Retained refs protect checkpoint trees. App-owned Git maintenance must leave a grace period for objects created before their capture refs are published; do not let global user configuration shorten that safety window. Maintenance failures may increase storage use but must not erase retained history. There is no configurable storage budget or automatic removal of repositories orphaned by identity changes.

Shadow repositories borrow source Git objects through alternates. Rewriting source history followed by aggressive source pruning can make an old checkpoint incomplete even while its shadow ref remains. These are recovery snapshots, not independent archival backups. Older checkpoint data stored inside user repositories is not migrated or read.

## Verification

Use isolated Git fixtures to cover preservation of staged state, refs and stash, unrelated edits, repository additions/replacements, conflicts, forced retries, partial failures, and cleanup. Test failure behavior and non-mutation as carefully as successful undo. Session execution and restart constraints live in [Session runtime](session-runtime.md).
