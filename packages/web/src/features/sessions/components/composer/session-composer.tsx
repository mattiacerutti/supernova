import type {UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {Node} from "@tiptap/core";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import History from "@tiptap/extension-history";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import {ReactNodeViewRenderer, useEditor} from "@tiptap/react";
import type {ChangeEvent, ClipboardEvent, ReactNode} from "react";
import {useRef, useState} from "react";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import ComposerAttachmentPreview from "@/features/sessions/components/attachments/composer-attachment-preview";
import ComposerEditor from "@/features/sessions/components/composer/editor/composer-editor";
import ComposerReference from "@/features/sessions/components/composer/editor/composer-reference";
import type {ComposerAttachmentsController} from "@/features/sessions/hooks/use-composer-attachments";
import {SESSION_ATTACHMENT_ACCEPT} from "@/features/sessions/lib/attachments/session-attachments";
import type {ClientSlashCommandActions} from "@/features/sessions/lib/composer/client-slash-commands";
import {contentPartsToEditorContent, editorToContentParts, textFromComposerContentParts, trimComposerContentParts} from "@/features/sessions/lib/composer/composer-content-parts";
import {createSuggestionExtension} from "@/features/sessions/lib/composer/composer-suggestions";
import type {ComposerSuggestionMatch} from "@/features/sessions/types/composer-suggestion";
import type {SessionLiveStatus} from "@/features/sessions/stores/session-live-store";
import {cn} from "@/lib/cn";

type ComposerClipboardEvent = ClipboardEvent<HTMLElement> | globalThis.ClipboardEvent;

type ComposerEditorInstance = ReturnType<typeof useEditor>;

interface SessionComposerDraft {
  readonly contentParts: readonly UserMessageContentPart[];
  readonly clear?: () => void;
  readonly setEditableContentParts?: (contentParts: readonly UserMessageContentPart[]) => void;
}

interface ComposerInputState {
  readonly draftText: string;
  readonly editor: ComposerEditorInstance;
  readonly onSuggestionMatchChange: (match: ComposerSuggestionMatch | null) => void;
  readonly suggestionMatch: ComposerSuggestionMatch | null;
}

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

interface SessionComposerAttachmentsProps {
  readonly attachments: ComposerAttachmentsController;
}

function SessionComposerAttachments(props: SessionComposerAttachmentsProps) {
  const {attachments} = props;

  return (
    <>
      {attachments.attachments.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 pb-2">
          {attachments.attachments.map((attachment) => (
            <ComposerAttachmentPreview attachment={attachment} key={attachment.id} onRemove={attachments.remove} />
          ))}
        </div>
      )}

      {attachments.isProcessing && <p className="px-1 pb-2 text-xs text-ink-muted">Preparing files...</p>}
    </>
  );
}

interface SessionComposerInputProps {
  readonly attachmentDisabled: boolean;
  readonly attachments: ComposerAttachmentsController;
  readonly input: ComposerInputState;
  readonly onSubmit: () => void;
  readonly placeholder: string;
  readonly projectPath: string;
  readonly slashCommandActions?: ClientSlashCommandActions;
}

function SessionComposerInput(props: SessionComposerInputProps) {
  const {attachmentDisabled, attachments, input, onSubmit, placeholder, projectPath, slashCommandActions} = props;

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
        editor={input.editor}
        onPaste={handlePaste}
        onSubmit={onSubmit}
        onSuggestionMatchChange={input.onSuggestionMatchChange}
        placeholder={placeholder}
        projectPath={projectPath}
        slashCommandActions={slashCommandActions}
        suggestionMatch={input.suggestionMatch}
        value={input.draftText}
      />
    </div>
  );
}

interface SessionComposerAttachButtonProps {
  readonly attachments: ComposerAttachmentsController;
  readonly disabled: boolean;
  readonly label?: string;
}

function SessionComposerAttachButton(props: SessionComposerAttachButtonProps) {
  const {attachments, disabled, label = "Attach files"} = props;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = (): void => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) attachments.addFiles(files);
    event.target.value = "";
  };

  return (
    <>
      <input accept={SESSION_ATTACHMENT_ACCEPT} className="hidden" disabled={disabled} multiple onChange={handleChange} ref={fileInputRef} type="file" />
      <IconButton
        label={label}
        className="grid size-8 place-items-center rounded-full text-ink-muted transition hover:bg-overlay-hover hover:text-ink-strong disabled:cursor-default disabled:text-ink-faint disabled:hover:bg-transparent"
        disabled={disabled}
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

interface SessionComposerSubmitButtonProps {
  readonly canInterrupt: boolean;
  readonly canSubmit: boolean;
  readonly isStreaming: boolean;
  readonly onClick: () => void;
  readonly streamStatus: SessionLiveStatus;
}

function SessionComposerSubmitButton(props: SessionComposerSubmitButtonProps) {
  const {canInterrupt, canSubmit, isStreaming, onClick, streamStatus} = props;
  const disabled = isStreaming ? !canInterrupt : !canSubmit;
  const label = isStreaming ? (streamStatus === "stopping" ? "Stopping stream" : "Stop streaming") : "Send message";

  return (
    <IconButton
      label={label}
      className="grid size-9 place-items-center rounded-full bg-ink text-ink-inverse transition hover:bg-ink-strong disabled:cursor-default disabled:bg-overlay-pressed disabled:text-ink-muted"
      disabled={disabled}
      onClick={onClick}
      size="none"
      variant="bare"
    >
      <Icon name={isStreaming ? "stop" : "send"} size="md" />
    </IconButton>
  );
}

interface SessionComposerProps {
  readonly attachments: ComposerAttachmentsController;
  readonly disabled: boolean;
  readonly draft: SessionComposerDraft;
  readonly onInterrupt?: () => void;
  readonly onSubmit: (contentParts: readonly UserMessageContentPart[]) => void;
  readonly placeholder?: string;
  readonly projectPath: string;
  readonly slashCommandActions?: ClientSlashCommandActions;
  readonly streamStatus?: SessionLiveStatus;
  readonly toolbarControls?: ReactNode;
  readonly topExtension?: ReactNode;
}

/** Renders the message composer, including editor, attachments, toolbar, and submit/stop action. */
export default function SessionComposer(props: SessionComposerProps) {
  const {
    attachments,
    disabled,
    draft,
    onInterrupt,
    onSubmit,
    placeholder = "Ask for follow-up changes",
    projectPath,
    slashCommandActions,
    streamStatus = "idle",
    toolbarControls,
    topExtension,
  } = props;

  const [draftText, setDraftText] = useState(() => textFromComposerContentParts(draft.contentParts));
  const [suggestionMatch, setSuggestionMatch] = useState<ComposerSuggestionMatch | null>(null);

  const inputDisabled = disabled;
  const isStreaming = streamStatus === "streaming" || streamStatus === "stopping";
  const attachmentDisabled = inputDisabled || attachments.isProcessing;
  const canSubmit = (draftText.trim().length > 0 || attachments.attachments.length > 0) && !inputDisabled && !attachments.isProcessing && streamStatus === "idle";
  const canInterrupt = streamStatus === "streaming";

  const editor = useEditor(
    {
      editable: !inputDisabled,
      content: contentPartsToEditorContent(draft.contentParts),
      editorProps: {
        attributes: {
          class: cn(
            "scroll-fade-y max-h-48 min-h-10 w-full min-w-0 overflow-y-auto whitespace-pre-wrap wrap-anywhere bg-transparent p-1 text-sm leading-5 text-ink outline-none",
            inputDisabled && "cursor-default opacity-60"
          ),
        },
      },
      extensions: [Document, Paragraph, Text, HardBreak, History, ComposerReferenceNode, createSuggestionExtension(setSuggestionMatch)],
      onCreate: ({editor: currentEditor}) => {
        setDraftText(currentEditor.getText());
        if (draft.contentParts.length > 0) draft.setEditableContentParts?.(editorToContentParts(currentEditor));
      },
      onUpdate: ({editor: currentEditor}) => {
        setDraftText(currentEditor.getText());
        draft.setEditableContentParts?.(editorToContentParts(currentEditor));
      },
    },
    [inputDisabled, draft.setEditableContentParts]
  );

  const submit = (): void => {
    if (!canSubmit) return;

    const trimmedContentParts = trimComposerContentParts(editor ? editorToContentParts(editor) : []);
    const textContentParts = trimmedContentParts.length > 0 ? trimmedContentParts : draftText.trim() ? [{text: draftText.trim(), type: "text" as const}] : [];
    onSubmit([...textContentParts, ...attachments.attachments]);
    editor?.commands.clearContent();
    setDraftText("");
    attachments.clear();
    draft.clear?.();
  };

  const handleSubmitButtonClick = (): void => {
    if (isStreaming) {
      if (canInterrupt) onInterrupt?.();
      return;
    }

    submit();
  };

  return (
    <div className="relative z-20 px-4 pb-7 md:px-6">
      <div className="relative mx-auto max-w-3xl">
        {topExtension && (
          <div className="pointer-events-none absolute inset-x-0 bottom-full z-0">
            <div className="pointer-events-auto">{topExtension}</div>
          </div>
        )}
        <div className="relative z-10 rounded-3xl corner-superellipse/1.3 bg-surface-control px-3 py-2 ring-1 ring-border-muted shadow-md">
          <SessionComposerAttachments attachments={attachments} />
          <SessionComposerInput
            attachmentDisabled={attachmentDisabled}
            attachments={attachments}
            input={{draftText, editor, onSuggestionMatchChange: setSuggestionMatch, suggestionMatch}}
            onSubmit={submit}
            placeholder={placeholder}
            projectPath={projectPath}
            slashCommandActions={slashCommandActions}
          />
          <div className="flex items-center justify-between gap-2">
            <SessionComposerAttachButton attachments={attachments} disabled={attachmentDisabled} />
            <div className="flex min-w-0 items-center gap-4">
              {toolbarControls}
              <SessionComposerSubmitButton
                canInterrupt={canInterrupt}
                canSubmit={canSubmit}
                isStreaming={isStreaming}
                onClick={handleSubmitButtonClick}
                streamStatus={streamStatus}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
