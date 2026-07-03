import type {UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import type {ComposerAttachmentsUpdate} from "@/features/sessions/hooks/use-composer-attachments";
import {useComposerDraftsStore} from "@/features/sessions/stores/composer-drafts-store";

interface UseComposerDraftInput {
  readonly key: string;
}

/** Provides the persisted composer content and draft mutation helpers for one composer instance. */
export function useComposerDraft(input: UseComposerDraftInput) {
  const {key} = input;

  const draft = useComposerDraftsStore((state) => state.drafts[key]);
  const clearDraft = useComposerDraftsStore((state) => state.clearDraft);
  const setDraftAttachments = useComposerDraftsStore((state) => state.setDraftAttachments);
  const setDraftContentParts = useComposerDraftsStore((state) => state.setDraftContentParts);
  const setDraftEditableContentParts = useComposerDraftsStore((state) => state.setDraftEditableContentParts);

  const editableContentParts = draft?.editableContentParts ?? [];
  const attachments = draft?.attachments ?? [];
  const contentParts = [...editableContentParts, ...attachments];
  const revision = draft?.revision ?? 0;

  const setEditableContentParts = (nextContentParts: readonly UserMessageContentPart[]): void => {
    setDraftEditableContentParts(key, nextContentParts);
  };

  const setAttachments = (update: ComposerAttachmentsUpdate): void => {
    setDraftAttachments(key, update);
  };

  const replaceContentParts = (nextContentParts: readonly UserMessageContentPart[]): void => {
    setDraftContentParts(key, nextContentParts);
  };

  const clear = (): void => {
    clearDraft(key);
  };

  return {attachments, clear, contentParts, replaceContentParts, revision, setAttachments, setEditableContentParts} as const;
}
