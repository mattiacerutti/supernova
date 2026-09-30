import {rm, writeFile} from "node:fs/promises";
import type {
  ForkSessionPayload,
  GetSessionPayload,
  ListComposerSuggestionsPayload,
  ListComposerSuggestionsResult,
  ListModelsPayload,
  ListModelsResult,
  RenameSessionPayload,
} from "@supernova/contracts/sessions/procedures";
import {CreateSessionError, ForkSessionError, RenameSessionError} from "@supernova/contracts/sessions/procedures";
import type {Session, SessionWorktree} from "@supernova/contracts/sessions/schemas";
import {toComposerSuggestions} from "@supernova/agent-runtime/features/sessions/lib/composer-suggestions";
import {resolveModelContextWindow} from "@supernova/agent-runtime/pi/lib/models/context-window";
import {toAgentModelDetails} from "@supernova/agent-runtime/pi/lib/models/map-model";
import {buildSessionSnapshot, sessionModelReference} from "@supernova/agent-runtime/pi/lib/session/build-session-snapshot";
import {refreshAuthAndModels} from "@supernova/agent-runtime/pi/lib/models/refresh-models";
import {CHECKPOINT_CURSOR_CUSTOM_TYPE, FORK_CUSTOM_TYPE, isCheckpointAfterTurnEntry} from "@supernova/agent-runtime/pi/lib/session/checkpoint-entries";
import {openSessionById, sessionPathById} from "@supernova/agent-runtime/pi/lib/session/open-session";
import {sessionWorkspace, WORKTREE_CUSTOM_TYPE} from "@supernova/agent-runtime/pi/lib/session/worktree-entry";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";

export interface SessionsDeps {
  readonly resourceCache: ResourceCache;
  readonly sdk: Pick<PiSdk, "modelRuntime" | "SessionManager">;
}

/** The durable session record: create, load, rename, and what a composer can reference. */
export class Sessions {
  public constructor(private readonly deps: SessionsDeps) {}

  /**
   * Creates a new empty Pi session for a project under the client's id. With a worktree the agent runs there (Pi's
   * cwd), while the file stays in the project's session folder so the project still lists it.
   */
  public async create(input: {readonly id: string; readonly projectPath: string; readonly worktree?: SessionWorktree}): Promise<Session> {
    const {id, projectPath, worktree} = input;
    // Pi names files `<timestamp>_<id>.jsonl`, so the exclusive write below cannot catch a reused id.
    if ((await sessionPathById(this.deps.sdk, id)) !== undefined) throw new CreateSessionError({message: "A session with this id already exists."});

    const sessionDir = worktree ? this.deps.sdk.SessionManager.create(projectPath).getSessionDir() : undefined;
    const sessionManager = this.deps.sdk.SessionManager.create(worktree?.path ?? projectPath, sessionDir, {id});
    const sessionFile = sessionManager.getSessionFile();
    const header = sessionManager.getHeader();
    if (!sessionFile || !header) throw new CreateSessionError({message: "Failed to create session."});

    // Pi only starts persisting once a conversation exists, so the header and the worktree marker are written here.
    if (worktree) sessionManager.appendCustomEntry(WORKTREE_CUSTOM_TYPE, {projectPath, worktree});
    await writeFile(sessionFile, [header, ...sessionManager.getEntries()].map((entry) => `${JSON.stringify(entry)}\n`).join(""), {flag: "wx"});
    return {
      id: sessionManager.getSessionId(),
      context: {usedTokens: 0, contextWindow: 0},
      forked: false,
      projectPath,
      title: "Untitled session",
      turns: [],
      undoneTurns: [],
      updatedAt: header.timestamp,
      worktree,
    };
  }

  /** The worktree a session runs in, if any. */
  public async getWorktree(input: GetSessionPayload): Promise<SessionWorktree | undefined> {
    return sessionWorkspace(await openSessionById(this.deps.sdk, input.sessionId)).worktree;
  }

  /** Removes a session's file. For undoing a `create` whose setup failed; archiving keeps the file. */
  public async delete(input: GetSessionPayload): Promise<void> {
    const path = await sessionPathById(this.deps.sdk, input.sessionId);
    if (path) await rm(path, {force: true});
  }

  /**
   * Copies the conversation up to and including a visible turn into a new session. The source is untouched and
   * workspace files are not changed. Checkpoints stay keyed by the source session, so the fork cannot undo
   * inherited turns; only turns made after the fork restore files.
   */
  public async fork(input: ForkSessionPayload): Promise<Session> {
    const source = await openSessionById(this.deps.sdk, input.sessionId);
    const sourceFile = source.getSessionFile();
    if (!sourceFile) throw new ForkSessionError({message: "Session has not been saved yet."});

    // A turn ends at its after-turn checkpoint; cutting there keeps its tool results and drops its cursor, whose
    // redo leaf would point outside the fork.
    const branch = source.getBranch();
    const turnIndex = branch.findIndex((entry) => entry.id === input.turnId && entry.type === "message" && entry.message.role === "user");
    const turnEnd = turnIndex === -1 ? undefined : branch.slice(turnIndex).find(isCheckpointAfterTurnEntry);
    if (!turnEnd) throw new ForkSessionError({message: "This message cannot be forked."});

    const fork = this.deps.sdk.SessionManager.open(sourceFile);
    if (!fork.createBranchedSession(turnEnd.id)) throw new ForkSessionError({message: "Failed to fork session."});
    fork.branch(turnEnd.id);
    fork.appendCustomEntry(CHECKPOINT_CURSOR_CUSTOM_TYPE, {leafEntryId: turnEnd.id});
    // Appended after the cursor so the cursor still hangs off the checkpoint it makes visible.
    fork.appendCustomEntry(FORK_CUSTOM_TYPE, {sourceSessionId: input.sessionId});

    const modelReference = sessionModelReference(fork);
    return buildSessionSnapshot({contextWindow: resolveModelContextWindow(this.deps.sdk, modelReference), modelReference, sessionManager: fork});
  }

  /** Loads one Pi session and maps it into the shared session detail contract. */
  public async get(input: GetSessionPayload): Promise<Session> {
    const sessionManager = await openSessionById(this.deps.sdk, input.sessionId);
    const modelReference = sessionModelReference(sessionManager);
    return buildSessionSnapshot({contextWindow: resolveModelContextWindow(this.deps.sdk, modelReference), modelReference, sessionManager});
  }

  /** Renames a Pi session by appending a session metadata entry. */
  public async rename(input: RenameSessionPayload): Promise<Session> {
    const title = input.title.trim();
    if (title.length === 0) throw new RenameSessionError({message: "Session title cannot be empty."});

    const sessionManager = await openSessionById(this.deps.sdk, input.sessionId);
    sessionManager.appendSessionInfo(title);

    const modelReference = sessionModelReference(sessionManager);
    if (!modelReference) {
      return {
        id: sessionManager.getSessionId(),
        context: {usedTokens: 0, contextWindow: 0},
        forked: sessionManager.getHeader()?.parentSession !== undefined,
        ...sessionWorkspace(sessionManager),
        title,
        turns: [],
        undoneTurns: [],
        updatedAt: new Date().toISOString(),
      };
    }
    return buildSessionSnapshot({contextWindow: resolveModelContextWindow(this.deps.sdk, modelReference), modelReference, sessionManager});
  }

  /** Lists available Pi models mapped into shared model details. */
  public async listModels(input: ListModelsPayload): Promise<ListModelsResult> {
    await this.deps.resourceCache.initialize(input.projectPath);
    await refreshAuthAndModels(this.deps.sdk);
    const {modelRuntime} = this.deps.sdk;
    return modelRuntime.getAvailableSnapshot().map((model) => toAgentModelDetails(model, modelRuntime.getProvider(model.provider)?.name ?? model.provider));
  }

  /** Returns the complete project resource list for client-side composer filtering. */
  public async listComposerSuggestions(input: ListComposerSuggestionsPayload): Promise<ListComposerSuggestionsResult> {
    const [skills, templates] = await Promise.all([this.deps.resourceCache.listSkills(input.projectPath), this.deps.resourceCache.listPromptTemplates(input.projectPath)]);
    return {items: toComposerSuggestions(skills, templates)};
  }
}
