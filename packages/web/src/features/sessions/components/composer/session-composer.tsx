import type {SessionAttachment} from "@pi-desktop/contracts/sessions/schemas";
import type {ChangeEvent, ClipboardEvent, KeyboardEvent, ReactNode} from "react";
import {createContext, useContext, useRef, useState} from "react";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import ComposerAttachmentPreview from "@/features/sessions/components/attachments/composer-attachment-preview";
import type {ComposerAttachmentsController} from "@/features/sessions/hooks/use-composer-attachments";
import {SESSION_ATTACHMENT_ACCEPT} from "@/features/sessions/lib/attachments/session-attachments";

interface SessionComposerContextValue {
  readonly attachmentDisabled: boolean;
  readonly attachments: ComposerAttachmentsController;
  readonly canInterrupt: boolean;
  readonly canSubmit: boolean;
  readonly draft: string;
  readonly inputDisabled: boolean;
  readonly isStreaming: boolean;
  readonly onInterrupt?: () => void;
  readonly setDraft: (draft: string) => void;
  readonly streamStatus: "idle" | "streaming" | "stopping";
  readonly submit: () => void;
}

const SessionComposerContext = createContext<SessionComposerContextValue | null>(null);

function useSessionComposerContext(): SessionComposerContextValue {
  const context = useContext(SessionComposerContext);
  if (!context) throw new Error("SessionComposer compound components must be rendered inside SessionComposer.Root.");

  return context;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function clipboardFiles(event: ClipboardEvent<HTMLTextAreaElement>): File[] {
  const files = Array.from(event.clipboardData.files);
  if (files.length > 0) return files;

  return Array.from(event.clipboardData.items).flatMap((item) => {
    if (item.kind !== "file") return [];

    const file = item.getAsFile();
    return file ? [file] : [];
  });
}

// -----------------------------------------------------------------------------
// Root
// -----------------------------------------------------------------------------

interface SessionComposerRootProps {
  readonly attachments: ComposerAttachmentsController;
  readonly children: ReactNode;
  readonly disabled: boolean;
  readonly onInterrupt?: () => void;
  readonly onSubmit: (message: string, attachments: readonly SessionAttachment[]) => void;
  readonly streamStatus?: "idle" | "streaming" | "stopping";
}

function SessionComposerRoot(props: SessionComposerRootProps) {
  const {attachments, children, disabled, onInterrupt, onSubmit, streamStatus = "idle"} = props;
  const [draft, setDraft] = useState("");

  const isStreaming = streamStatus !== "idle";
  const inputDisabled = disabled || isStreaming;
  const canSubmit = (draft.trim().length > 0 || attachments.attachments.length > 0) && !disabled && !isStreaming && !attachments.isProcessing;
  const canInterrupt = streamStatus === "streaming";
  const attachmentDisabled = inputDisabled || attachments.isProcessing;

  const submit = (): void => {
    if (!canSubmit) return;

    onSubmit(draft.trim(), attachments.attachments);
    setDraft("");
    attachments.clear();
  };

  return (
    <SessionComposerContext.Provider
      value={{attachmentDisabled, attachments, canInterrupt, canSubmit, draft, inputDisabled, isStreaming, onInterrupt, setDraft, streamStatus, submit}}
    >
      <div className="px-4 pb-4 md:px-6">
        <div className="mx-auto max-w-3xl rounded-3xl corner-superellipse/1.3 bg-[#2b2b2b] px-3 py-2 ring-1 ring-white/6 shadow-md">{children}</div>
      </div>
    </SessionComposerContext.Provider>
  );
}

// -----------------------------------------------------------------------------
// Attachments
// -----------------------------------------------------------------------------

function SessionComposerAttachments() {
  const {attachments} = useSessionComposerContext();

  return (
    <>
      {attachments.attachments.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 pb-2">
          {attachments.attachments.map((attachment) => (
            <ComposerAttachmentPreview attachment={attachment} key={attachment.id} onRemove={attachments.remove} />
          ))}
        </div>
      )}

      {attachments.isProcessing && <p className="px-1 pb-2 text-xs text-neutral-500">Preparing files...</p>}
    </>
  );
}

// -----------------------------------------------------------------------------
// Input
// -----------------------------------------------------------------------------

interface SessionComposerInputProps {
  readonly placeholder?: string;
}

function SessionComposerInput(props: SessionComposerInputProps) {
  const {placeholder = "Ask for follow-up changes"} = props;
  const {attachmentDisabled, attachments, draft, inputDisabled, setDraft, submit} = useSessionComposerContext();

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    submit();
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = clipboardFiles(event);
    if (files.length === 0) return;

    event.preventDefault();
    if (attachmentDisabled) return;

    attachments.addFiles(files);
  };

  return (
    <textarea
      className="max-h-48 min-h-10 w-full resize-none overflow-y-auto bg-transparent p-1 text-sm text-neutral-200 outline-none field-sizing-content placeholder:text-md placeholder:font-light placeholder:text-white/25"
      disabled={inputDisabled}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      placeholder={placeholder}
      rows={1}
      value={draft}
    />
  );
}

// -----------------------------------------------------------------------------
// Toolbar
// -----------------------------------------------------------------------------

function SessionComposerToolbar({children}: {children: ReactNode}) {
  return <div className="flex items-center justify-between gap-2">{children}</div>;
}

// -----------------------------------------------------------------------------
// Action Group
// -----------------------------------------------------------------------------

function SessionComposerActionGroup({children}: {children: ReactNode}) {
  return <div className="flex min-w-0 items-center gap-4">{children}</div>;
}

// -----------------------------------------------------------------------------
// Attach Button
// -----------------------------------------------------------------------------

interface SessionComposerButtonProps {
  readonly label?: string;
}

function SessionComposerAttachButton(props: SessionComposerButtonProps) {
  const {label = "Attach files"} = props;
  const {attachmentDisabled, attachments} = useSessionComposerContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = (): void => {
    if (attachmentDisabled) return;
    fileInputRef.current?.click();
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) attachments.addFiles(files);
    event.target.value = "";
  };

  return (
    <>
      <input accept={SESSION_ATTACHMENT_ACCEPT} className="hidden" disabled={attachmentDisabled} multiple onChange={handleChange} ref={fileInputRef} type="file" />
      <IconButton
        label={label}
        className="grid size-8 place-items-center rounded-full text-neutral-400 transition hover:bg-white/6 hover:text-neutral-100 disabled:cursor-default disabled:text-neutral-600 disabled:hover:bg-transparent"
        disabled={attachmentDisabled}
        onClick={handleClick}
        size="none"
        title={label}
        variant="ghost"
      >
        <Icon name="plus" size="sm" />
      </IconButton>
    </>
  );
}

// -----------------------------------------------------------------------------
// Submit Button
// -----------------------------------------------------------------------------

function SessionComposerSubmitButton() {
  const {canInterrupt, canSubmit, isStreaming, onInterrupt, streamStatus, submit} = useSessionComposerContext();
  const disabled = isStreaming ? !canInterrupt : !canSubmit;
  const label = isStreaming ? (streamStatus === "stopping" ? "Stopping stream" : "Stop streaming") : "Send message";

  const handleClick = (): void => {
    if (isStreaming) {
      if (canInterrupt) onInterrupt?.();
      return;
    }

    submit();
  };

  return (
    <IconButton
      label={label}
      className="grid size-9 place-items-center rounded-full bg-neutral-300 text-neutral-950 transition hover:bg-white disabled:cursor-default disabled:bg-white/10 disabled:text-neutral-500"
      disabled={disabled}
      onClick={handleClick}
      size="none"
      variant="bare"
    >
      <Icon name={isStreaming ? "stop" : "send"} size="md" />
    </IconButton>
  );
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

const SessionComposer = {
  ActionGroup: SessionComposerActionGroup,
  AttachButton: SessionComposerAttachButton,
  Attachments: SessionComposerAttachments,
  Input: SessionComposerInput,
  Root: SessionComposerRoot,
  SubmitButton: SessionComposerSubmitButton,
  Toolbar: SessionComposerToolbar,
} as const;

export default SessionComposer;
