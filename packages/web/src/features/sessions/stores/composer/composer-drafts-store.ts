import type {SessionWorkspaceSelection, UserMessageAttachmentPart, UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";
import {create} from "zustand";
import type {ComposerAttachmentsUpdate} from "@/features/sessions/hooks/composer/use-composer-attachments";
import {attachmentComposerContentParts, editableComposerContentParts} from "@/features/sessions/lib/composer/editor/composer-content-parts";

export interface ComposerDraft {
  readonly attachments?: readonly UserMessageAttachmentPart[];
  readonly editableContentParts?: readonly UserMessageContentPart[];
  readonly revision: number;
  /** Where the session will run, for a draft whose session does not exist yet. Defaults to the project's checkout. */
  readonly workspace?: SessionWorkspaceSelection;
}

interface ComposerDraftsState {
  /** Composer content per session id, including sessions that exist only as a draft so far. */
  readonly drafts: Record<string, ComposerDraft | undefined>;
  /**
   * The id a project's next session will get, minted when its new-session screen is first opened. One per project,
   * so leaving the screen and coming back finds the same draft; several drafts per project would be a list here.
   */
  readonly newSessionIds: Record<string, string | undefined>;
  readonly clearDraft: (sessionId: string) => void;
  /** The project's pending new-session id, minting one when there is none. */
  readonly ensureNewSessionId: (projectPath: string) => string;
  readonly setDraftAttachments: (sessionId: string, update: ComposerAttachmentsUpdate) => void;
  readonly setDraftContentParts: (sessionId: string, contentParts: readonly UserMessageContentPart[]) => void;
  readonly setDraftEditableContentParts: (sessionId: string, contentParts: readonly UserMessageContentPart[]) => void;
  readonly setDraftWorkspace: (sessionId: string, workspace: SessionWorkspaceSelection) => void;
  /** Clears the pending id once its session is being created, or puts it back when that failed. */
  readonly setNewSessionId: (projectPath: string, sessionId: string | undefined) => void;
}

export const useComposerDraftsStore = create<ComposerDraftsState>()((set, get) => ({
  drafts: {},
  newSessionIds: {},
  clearDraft: (sessionId) => {
    set((state) => {
      const drafts = {...state.drafts};
      delete drafts[sessionId];
      return {drafts};
    });
  },
  setDraftAttachments: (sessionId, update) => {
    set((state) => {
      const draft = state.drafts[sessionId] ?? {revision: 0};
      const attachments = typeof update === "function" ? update(draft.attachments ?? []) : update;

      return {drafts: {...state.drafts, [sessionId]: {...draft, attachments}}};
    });
  },
  setDraftContentParts: (sessionId, contentParts) => {
    set((state) => {
      const draft = state.drafts[sessionId];
      return {
        drafts: {
          ...state.drafts,
          [sessionId]: {
            attachments: attachmentComposerContentParts(contentParts),
            editableContentParts: editableComposerContentParts(contentParts),
            revision: (draft?.revision ?? 0) + 1,
            ...(draft?.workspace ? {workspace: draft.workspace} : {}),
          },
        },
      };
    });
  },
  setDraftEditableContentParts: (sessionId, editableContentParts) => {
    set((state) => {
      const draft = state.drafts[sessionId] ?? {revision: 0};
      return {drafts: {...state.drafts, [sessionId]: {...draft, editableContentParts}}};
    });
  },
  setDraftWorkspace: (sessionId, workspace) => {
    set((state) => {
      const draft = state.drafts[sessionId] ?? {revision: 0};
      return {drafts: {...state.drafts, [sessionId]: {...draft, workspace}}};
    });
  },
  ensureNewSessionId: (projectPath) => {
    const existing = get().newSessionIds[projectPath];
    if (existing) return existing;
    const sessionId = crypto.randomUUID();
    set((state) => ({newSessionIds: {...state.newSessionIds, [projectPath]: sessionId}}));
    return sessionId;
  },
  setNewSessionId: (projectPath, sessionId) => {
    set((state) => ({newSessionIds: {...state.newSessionIds, [projectPath]: sessionId}}));
  },
}));
