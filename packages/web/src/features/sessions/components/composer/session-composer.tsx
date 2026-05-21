import type {UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import History from "@tiptap/extension-history";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import {useEditor} from "@tiptap/react";
import type {ChangeEvent, ClipboardEvent, ReactNode} from "react";
import {createContext, useContext, useRef, useState} from "react";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import ComposerAttachmentPreview from "@/features/sessions/components/attachments/composer-attachment-preview";
import ComposerEditor from "@/features/sessions/components/composer/editor/composer-editor";
import {editorToContentParts, trimComposerContentParts} from "@/features/sessions/lib/composer/composer-content-parts";
import type {ComposerAttachmentsController} from "@/features/sessions/hooks/use-composer-attachments";
import {SESSION_ATTACHMENT_ACCEPT} from "@/features/sessions/lib/attachments/session-attachments";
import type {ComposerSuggestionMatch} from "@/features/sessions/types/composer-suggestion";
import {cn} from "@/lib/cn";
import {createSuggestionExtension} from "@/features/sessions/lib/composer/composer-suggestions";
import {Node} from "@tiptap/core";
import {ReactNodeViewRenderer} from "@tiptap/react";
import ComposerReference from "@/features/sessions/components/composer/editor/composer-reference";

type ComposerClipboardEvent = ClipboardEvent<HTMLElement> | globalThis.ClipboardEvent;

interface SessionComposerContextValue {
  readonly attachmentDisabled: boolean;
  readonly attachments: ComposerAttachmentsController;
  readonly canInterrupt: boolean;
  readonly canSubmit: boolean;
  readonly suggestionMatch: ComposerSuggestionMatch | null;
  readonly draft: string;
  readonly editor: ReturnType<typeof useEditor>;
  readonly inputDisabled: boolean;
  readonly isStreaming: boolean;
  readonly onInterrupt?: () => void;
  readonly projectPath: string;
  readonly setSuggestionMatch: (match: ComposerSuggestionMatch | null) => void;
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

function clipboardFiles(event: ComposerClipboardEvent): File[] {
  const clipboardData = event.clipboardData;
  if (!clipboardData) return [];

  const files = Array.from(clipboardData.files);
  if (files.length > 0) return files;

  return Array.from(clipboardData.items).flatMap((item) => {
    if (item.kind !== "file") return [];

    const file = item.getAsFile();
    return file ? [file] : [];
  });
}

// -----------------------------------------------------------------------------
// Root
// -----------------------------------------------------------------------------

// TipTap node for message content references (e.g. files, skills)
const ComposerReferenceNode = Node.create({
  addAttributes() {
    return {
      id: {default: ""},
      kind: {default: ""},
      name: {default: ""},
      value: {default: ""},
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ComposerReference);
  },
  atom: true,
  group: "inline",
  inline: true,
  name: "composerReference",
  parseHTML() {
    return [{tag: "span[data-composer-reference]"}];
  },
  renderHTML({HTMLAttributes}) {
    return ["span", {"data-composer-reference": "", ...HTMLAttributes}];
  },
  renderText({node}) {
    return String(node.attrs.value ?? "");
  },
  selectable: false,
});

interface SessionComposerRootProps {
  readonly attachments: ComposerAttachmentsController;
  readonly children: ReactNode;
  readonly disabled: boolean;
  readonly onInterrupt?: () => void;
  readonly onSubmit: (contentParts: readonly UserMessageContentPart[]) => void;
  readonly projectPath: string;
  readonly streamStatus?: "idle" | "streaming" | "stopping";
}

function SessionComposerRoot(props: SessionComposerRootProps) {
  const {attachments, children, disabled, onInterrupt, onSubmit, projectPath, streamStatus = "idle"} = props;
  const [draft, setDraft] = useState("");
  const [suggestionMatch, setSuggestionMatch] = useState<ComposerSuggestionMatch | null>(null);

  const isStreaming = streamStatus !== "idle";
  const inputDisabled = disabled || isStreaming;
  const canSubmit = (draft.trim().length > 0 || attachments.attachments.length > 0) && !disabled && !isStreaming && !attachments.isProcessing;
  const canInterrupt = streamStatus === "streaming";
  const attachmentDisabled = inputDisabled || attachments.isProcessing;

  const editor = useEditor(
    {
      editable: !inputDisabled,
      editorProps: {
        attributes: {
          class: cn(
            "max-h-48 min-h-10 w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent p-1 text-sm leading-5 text-neutral-200 outline-none",
            inputDisabled && "cursor-default opacity-60"
          ),
        },
      },
      extensions: [Document, Paragraph, Text, HardBreak, History, ComposerReferenceNode, createSuggestionExtension(setSuggestionMatch)],
      onUpdate: ({editor: currentEditor}) => {
        setDraft(currentEditor.getText());
      },
    },
    [inputDisabled]
  );

  const submit = (): void => {
    if (!canSubmit) return;

    const trimmedContentParts = trimComposerContentParts(editor ? editorToContentParts(editor) : []);
    const textContentParts = trimmedContentParts.length > 0 ? trimmedContentParts : draft.trim() ? [{text: draft.trim(), type: "text" as const}] : [];
    onSubmit([...textContentParts, ...attachments.attachments]);
    editor?.commands.clearContent();
    setDraft("");
    attachments.clear();
  };

  return (
    <SessionComposerContext.Provider
      value={{
        attachmentDisabled,
        attachments,
        canInterrupt,
        canSubmit,
        suggestionMatch,
        draft,
        editor,
        inputDisabled,
        isStreaming,
        onInterrupt,
        projectPath,
        setSuggestionMatch,
        setDraft,
        streamStatus,
        submit,
      }}
    >
      <div className="px-4 pb-4 md:px-6">
        <div className="relative mx-auto max-w-3xl rounded-3xl corner-superellipse/1.3 bg-[#2b2b2b] px-3 py-2 ring-1 ring-white/6 shadow-md">{children}</div>
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
  const {attachmentDisabled, attachments, draft, editor, projectPath, setSuggestionMatch, submit, suggestionMatch} = useSessionComposerContext();

  const handlePaste = (event: ComposerClipboardEvent): void => {
    const files = clipboardFiles(event);
    if (files.length === 0) return;

    event.preventDefault();
    if (attachmentDisabled) return;

    attachments.addFiles(files);
  };

  return (
    <div className="relative -mx-3 px-3">
      <ComposerEditor
        suggestionMatch={suggestionMatch}
        editor={editor}
        onSuggestionMatchChange={setSuggestionMatch}
        onPaste={handlePaste}
        onSubmit={submit}
        placeholder={placeholder}
        projectPath={projectPath}
        value={draft}
      />
    </div>
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
