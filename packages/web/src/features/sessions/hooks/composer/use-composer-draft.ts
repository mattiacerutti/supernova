import type {SessionWorkspaceSelection, UserMessageAttachmentPart, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import type {ComposerAttachmentsUpdate} from "@/features/sessions/hooks/composer/use-composer-attachments";
import {useComposerDraftsStore} from "@/features/sessions/stores/composer/composer-drafts-store";

export interface ComposerDraft {
  readonly attachments: readonly UserMessageAttachmentPart[];
  readonly contentParts: readonly UserMessageContentPart[];
  /** Bumps when the draft is replaced wholesale, so the editor remounts with the new content. */
  readonly revision: number;
  /** Where a not-yet-created session will run. */
  readonly workspace: SessionWorkspaceSelection;
  readonly clear: () => void;
  readonly replaceContentParts: (contentParts: readonly UserMessageContentPart[]) => void;
  readonly setAttachments: (update: ComposerAttachmentsUpdate) => void;
  readonly setEditableContentParts: (contentParts: readonly UserMessageContentPart[]) => void;
  readonly setWorkspace: (workspace: SessionWorkspaceSelection) => void;
}

/** The composer content kept for a session, and the helpers that change it. */
export function useComposerDraft(sessionId: string): ComposerDraft {
  const draft = useComposerDraftsStore((state) => state.drafts[sessionId]);
  const clearDraft = useComposerDraftsStore((state) => state.clearDraft);
  const setDraftAttachments = useComposerDraftsStore((state) => state.setDraftAttachments);
  const setDraftContentParts = useComposerDraftsStore((state) => state.setDraftContentParts);
  const setDraftEditableContentParts = useComposerDraftsStore((state) => state.setDraftEditableContentParts);
  const setDraftWorkspace = useComposerDraftsStore((state) => state.setDraftWorkspace);

  const editableContentParts = draft?.editableContentParts ?? [];
  const attachments = draft?.attachments ?? [];
  const contentParts = [...editableContentParts, ...attachments];
  const revision = draft?.revision ?? 0;
  const workspace = draft?.workspace ?? {mode: "local" as const};

  const setEditableContentParts = (nextContentParts: readonly UserMessageContentPart[]): void => {
    setDraftEditableContentParts(sessionId, nextContentParts);
  };

  const setAttachments = (update: ComposerAttachmentsUpdate): void => {
    setDraftAttachments(sessionId, update);
  };

  const replaceContentParts = (nextContentParts: readonly UserMessageContentPart[]): void => {
    setDraftContentParts(sessionId, nextContentParts);
  };

  const setWorkspace = (nextWorkspace: SessionWorkspaceSelection): void => {
    setDraftWorkspace(sessionId, nextWorkspace);
  };

  const clear = (): void => {
    clearDraft(sessionId);
  };

  return {attachments, clear, contentParts, replaceContentParts, revision, setAttachments, setEditableContentParts, setWorkspace, workspace};
}
