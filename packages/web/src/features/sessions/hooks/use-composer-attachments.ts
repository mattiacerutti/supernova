import type {DragEvent, HTMLAttributes} from "react";
import {useRef, useState} from "react";
import {useMutation} from "@tanstack/react-query";
import type {AgentSessionAttachment} from "@pi-desktop/contracts/sessions/schemas";
import {
  fileRequiresImageCapability,
  fileToSessionAttachment,
  formatAttachmentSize,
  MAX_SESSION_ATTACHMENT_BYTES,
  MAX_SESSION_ATTACHMENTS,
} from "@/features/sessions/lib/attachments/session-attachments";

export type ComposerAttachmentDropZoneProps = Pick<HTMLAttributes<HTMLDivElement>, "onDragEnter" | "onDragLeave" | "onDragOver" | "onDrop">;

export interface ComposerAttachmentsController {
  readonly addFiles: (files: readonly File[]) => void;
  readonly attachments: readonly AgentSessionAttachment[];
  readonly clear: () => void;
  readonly dropZoneProps: ComposerAttachmentDropZoneProps;
  readonly error: string | null;
  readonly isDraggingFiles: boolean;
  readonly isProcessing: boolean;
  readonly remove: (attachmentId: string) => void;
  readonly removeUnsupportedImages: () => void;
}

interface ProcessFilesResult {
  readonly attachments: readonly AgentSessionAttachment[];
  readonly error: string | null;
}

function hasDraggedFiles(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

function attachmentLimitMessage(): string {
  return `Attach up to ${MAX_SESSION_ATTACHMENTS} files.`;
}

function attachmentSizeMessage(file: File): string {
  return `${file.name} exceeds the ${formatAttachmentSize(MAX_SESSION_ATTACHMENT_BYTES)} attachment limit.`;
}

function attachmentRequiresImageCapability(attachment: AgentSessionAttachment): boolean {
  return attachment.mime.startsWith("image/");
}

interface UseComposerAttachmentsInput {
  readonly disabled: boolean;
  readonly imageSupported: boolean;
}

export function useComposerAttachments(input: UseComposerAttachmentsInput): ComposerAttachmentsController {
  const {disabled, imageSupported} = input;

  const [attachments, setAttachments] = useState<readonly AgentSessionAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

  const dragDepthRef = useRef(0);

  const processFilesMutation = useMutation({
    mutationFn: async (files: readonly File[]): Promise<ProcessFilesResult> => {
      const nextAttachments: AgentSessionAttachment[] = [];
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
          nextAttachments.push(await fileToSessionAttachment(file));
        } catch (cause) {
          errors.push(cause instanceof Error ? cause.message : `Failed to read ${file.name}.`);
        }
      }

      return {attachments: nextAttachments, error: errors.at(0) ?? null};
    },
    onSuccess: (result) => {
      if (result.attachments.length > 0) {
        setAttachments((current) => [...current, ...result.attachments]);
      }

      setError(result.error);
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : "Failed to read attachments.");
    },
    onMutate: () => {
      setError(null);
    },
  });

  const isProcessing = processFilesMutation.isPending;

  const clear = (): void => {
    setAttachments([]);
    setError(null);
  };

  const remove = (attachmentId: string): void => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
    setError(null);
  };

  const removeUnsupportedImages = (): void => {
    setAttachments((current) => current.filter((attachment) => !attachmentRequiresImageCapability(attachment)));
    setError(null);
  };

  const addFiles = (files: readonly File[]): void => {
    if (disabled || isProcessing || files.length === 0) return;

    if (attachments.length + files.length > MAX_SESSION_ATTACHMENTS) {
      setError(attachmentLimitMessage());
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
    error,
    isDraggingFiles,
    isProcessing,
    remove,
    removeUnsupportedImages,
  };
}
