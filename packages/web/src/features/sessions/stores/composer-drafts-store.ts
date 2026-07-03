import type {UserMessageAttachmentPart, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {create} from "zustand";
import type {ComposerAttachmentsUpdate} from "@/features/sessions/hooks/use-composer-attachments";
import {attachmentComposerContentParts, editableComposerContentParts} from "@/features/sessions/lib/composer/composer-content-parts";

export interface ComposerDraft {
  readonly attachments?: readonly UserMessageAttachmentPart[];
  readonly editableContentParts?: readonly UserMessageContentPart[];
  readonly revision: number;
}

interface ComposerDraftsState {
  readonly drafts: Record<string, ComposerDraft | undefined>;
  readonly clearDraft: (key: string) => void;
  readonly setDraftAttachments: (key: string, update: ComposerAttachmentsUpdate) => void;
  readonly setDraftContentParts: (key: string, contentParts: readonly UserMessageContentPart[]) => void;
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
  setDraftAttachments: (key, update) => {
    set((state) => {
      const draft = state.drafts[key] ?? {revision: 0};
      const attachments = typeof update === "function" ? update(draft.attachments ?? []) : update;

      return {drafts: {...state.drafts, [key]: {...draft, attachments}}};
    });
  },
  setDraftContentParts: (key, contentParts) => {
    set((state) => {
      const revision = (state.drafts[key]?.revision ?? 0) + 1;
      return {
        drafts: {
          ...state.drafts,
          [key]: {
            attachments: attachmentComposerContentParts(contentParts),
            editableContentParts: editableComposerContentParts(contentParts),
            revision,
          },
        },
      };
    });
  },
  setDraftEditableContentParts: (key, editableContentParts) => {
    set((state) => {
      const draft = state.drafts[key] ?? {revision: 0};
      return {drafts: {...state.drafts, [key]: {...draft, editableContentParts}}};
    });
  },
}));
