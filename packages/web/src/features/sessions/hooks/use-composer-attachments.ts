import type {DragEvent, HTMLAttributes} from "react";
import {useRef, useState} from "react";
import {useMutation} from "@tanstack/react-query";
import type {UserMessageAttachmentPart, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {
  fileRequiresImageCapability,
  fileToSessionAttachmentPart,
  formatAttachmentSize,
  MAX_SESSION_ATTACHMENT_BYTES,
  MAX_SESSION_ATTACHMENTS,
  UnsupportedAttachmentTypeError,
} from "@/features/sessions/lib/attachments/session-attachments";
import {showToast} from "@/components/ui/toast-manager";

export type ComposerAttachmentDropZoneProps = Pick<HTMLAttributes<HTMLDivElement>, "onDragEnter" | "onDragLeave" | "onDragOver" | "onDrop">;

export interface ComposerAttachmentsController {
  readonly addFiles: (files: readonly File[]) => void;
  readonly attachments: readonly UserMessageAttachmentPart[];
  readonly clear: () => void;
  readonly dropZoneProps: ComposerAttachmentDropZoneProps;
  readonly isDraggingFiles: boolean;
  readonly isProcessing: boolean;
  readonly remove: (attachmentId: string) => void;
  readonly removeUnsupportedImages: () => void;
}

interface ProcessFilesResult {
  readonly attachments: readonly UserMessageAttachmentPart[];
  readonly errors: readonly string[];
}

function hasDraggedFiles(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

function attachmentLimitMessage(): string {
  return `Attach up to ${MAX_SESSION_ATTACHMENTS} files.`;
}

function attachmentReadFailureMessage(file: File): string {
  return `Could not read ${file.name}.`;
}

function attachmentSizeMessage(file: File): string {
  return `${file.name} exceeds the ${formatAttachmentSize(MAX_SESSION_ATTACHMENT_BYTES)} attachment limit.`;
}

function attachmentRequiresImageCapability(attachment: UserMessageAttachmentPart): boolean {
  return attachment.mime.startsWith("image/");
}

interface UseComposerAttachmentsInput {
  readonly disabled: boolean;
  readonly imageSupported: boolean;
  readonly initialContentParts?: readonly UserMessageContentPart[];
}

interface ComposerAttachmentsState {
  readonly attachments: readonly UserMessageAttachmentPart[];
  readonly initialContentParts: readonly UserMessageContentPart[];
}

function attachmentsFromContentParts(parts: readonly UserMessageContentPart[]): readonly UserMessageAttachmentPart[] {
  return parts.filter((part) => part.type === "attachment");
}

export function useComposerAttachments(input: UseComposerAttachmentsInput): ComposerAttachmentsController {
  const {disabled, imageSupported, initialContentParts = []} = input;

  const [attachmentState, setAttachmentState] = useState<ComposerAttachmentsState>({attachments: attachmentsFromContentParts(initialContentParts), initialContentParts});
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

  let attachments = attachmentState.attachments;
  if (attachmentState.initialContentParts !== initialContentParts) {
    attachments = attachmentsFromContentParts(initialContentParts);
    setAttachmentState({attachments, initialContentParts});
  }

  const dragDepthRef = useRef(0);

  const processFilesMutation = useMutation({
    mutationFn: async (files: readonly File[]): Promise<ProcessFilesResult> => {
      const nextAttachments: UserMessageAttachmentPart[] = [];
      const errors: string[] = [];

      for (const file of files) {
        if (file.size > MAX_SESSION_ATTACHMENT_BYTES) {
          errors.push(attachmentSizeMessage(file));
          continue;
        }

        if (!imageSupported && fileRequiresImageCapability(file)) {
          errors.push(`${file.name} is an image attachment, but the selected model does not support images.`);
          continue;
        }

        try {
          nextAttachments.push(await fileToSessionAttachmentPart(file));
        } catch (cause) {
          errors.push(cause instanceof UnsupportedAttachmentTypeError ? cause.message : attachmentReadFailureMessage(file));
        }
      }

      return {attachments: nextAttachments, errors};
    },
    onSuccess: (result) => {
      if (result.attachments.length > 0) {
        setAttachmentState((current) => ({...current, attachments: [...current.attachments, ...result.attachments]}));
      }

      for (const error of result.errors) {
        showToast("Attachment not added", error);
      }
    },
    onError: () => {
      showToast("Attachment not added", "Failed to read attachments.");
    },
  });

  const isProcessing = processFilesMutation.isPending;

  const clear = (): void => {
    setAttachmentState((current) => ({...current, attachments: []}));
  };

  const remove = (attachmentId: string): void => {
    setAttachmentState((current) => ({...current, attachments: current.attachments.filter((attachment) => attachment.id !== attachmentId)}));
  };

  const removeUnsupportedImages = (): void => {
    setAttachmentState((current) => ({...current, attachments: current.attachments.filter((attachment) => !attachmentRequiresImageCapability(attachment))}));
  };

  const addFiles = (files: readonly File[]): void => {
    if (disabled || isProcessing || files.length === 0) return;

    if (attachments.length + files.length > MAX_SESSION_ATTACHMENTS) {
      showToast("Attachment not added", attachmentLimitMessage());
      return;
    }

    processFilesMutation.mutate(files);
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>): void => {
    if (disabled || isProcessing || !hasDraggedFiles(event)) return;

    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFiles(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (disabled || isProcessing || !hasDraggedFiles(event)) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingFiles(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    if (disabled || isProcessing || !hasDraggedFiles(event)) return;

    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFiles(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    if (disabled || isProcessing || !hasDraggedFiles(event)) return;

    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    addFiles(Array.from(event.dataTransfer.files));
  };

  return {
    addFiles,
    attachments,
    clear,
    dropZoneProps: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
    isDraggingFiles,
    isProcessing,
    remove,
    removeUnsupportedImages,
  };
}
