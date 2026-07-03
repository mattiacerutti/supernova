import type {UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {useCallback} from "react";
import type {ComposerAttachmentsUpdate} from "@/features/sessions/hooks/use-composer-attachments";
import {attachmentComposerContentParts, editableComposerContentParts} from "@/features/sessions/lib/composer/composer-content-parts";
import {useComposerDraftsStore} from "@/features/sessions/stores/composer-drafts-store";

const EMPTY_CONTENT_PARTS: readonly UserMessageContentPart[] = [];

interface UseComposerDraftInput {
  readonly fallbackContentParts?: readonly UserMessageContentPart[];
  readonly key: string;
}

/** Provides the persisted composer content and draft mutation helpers for one composer instance. */
export function useComposerDraft(input: UseComposerDraftInput) {
  const {fallbackContentParts = EMPTY_CONTENT_PARTS, key} = input;

  const draft = useComposerDraftsStore((state) => state.drafts[key]);
  const clearDraft = useComposerDraftsStore((state) => state.clearDraft);
  const setDraftAttachments = useComposerDraftsStore((state) => state.setDraftAttachments);
  const setDraftEditableContentParts = useComposerDraftsStore((state) => state.setDraftEditableContentParts);

  const fallbackEditableContentParts = editableComposerContentParts(fallbackContentParts);
  const fallbackAttachments = attachmentComposerContentParts(fallbackContentParts);
  const editableContentParts = draft?.editableContentParts ?? fallbackEditableContentParts;
  const attachments = draft?.attachments ?? fallbackAttachments;
  const contentParts = [...editableContentParts, ...attachments];

  const setEditableContentParts = useCallback(
    (nextContentParts: readonly UserMessageContentPart[]): void => {
      setDraftEditableContentParts(key, nextContentParts);
    },
    [key, setDraftEditableContentParts]
  );

  const setAttachments = (update: ComposerAttachmentsUpdate): void => {
    setDraftAttachments(key, update, fallbackAttachments);
  };

  const clear = useCallback((): void => {
    clearDraft(key);
  }, [clearDraft, key]);

  return {attachments, clear, contentParts, setAttachments, setEditableContentParts} as const;
}
