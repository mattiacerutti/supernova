import type {UserMessageAttachmentPart, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {create} from "zustand";
import type {ComposerAttachmentsUpdate} from "@/features/sessions/hooks/use-composer-attachments";

export interface ComposerDraft {
  readonly attachments?: readonly UserMessageAttachmentPart[];
  readonly editableContentParts?: readonly UserMessageContentPart[];
}

interface ComposerDraftsState {
  readonly drafts: Record<string, ComposerDraft | undefined>;
  readonly clearDraft: (key: string) => void;
  readonly setDraftAttachments: (key: string, update: ComposerAttachmentsUpdate, fallbackAttachments: readonly UserMessageAttachmentPart[]) => void;
  readonly setDraftEditableContentParts: (key: string, contentParts: readonly UserMessageContentPart[]) => void;
}

/** Returns the stable draft key for the new chat composer in a project. */
export function newSessionComposerDraftKey(projectPath: string): string {
  return `new-session:${projectPath}`;
}

/** Returns the stable draft key for an existing session composer. */
export function sessionComposerDraftKey(sessionId: string): string {
  return `session:${sessionId}`;
}

export const useComposerDraftsStore = create<ComposerDraftsState>()((set) => ({
  drafts: {},
  clearDraft: (key) => {
    set((state) => {
      const drafts = {...state.drafts};
      delete drafts[key];
      return {drafts};
    });
  },
  setDraftAttachments: (key, update, fallbackAttachments) => {
    set((state) => {
      const draft = state.drafts[key];
      const currentAttachments = draft?.attachments ?? fallbackAttachments;
      const attachments = typeof update === "function" ? update(currentAttachments) : update;

      return {drafts: {...state.drafts, [key]: {...draft, attachments}}};
    });
  },
  setDraftEditableContentParts: (key, editableContentParts) => {
    set((state) => ({drafts: {...state.drafts, [key]: {...state.drafts[key], editableContentParts}}}));
  },
}));
