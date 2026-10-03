import type {UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";
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
import ComposerAttachmentPreview from "@/features/sessions/components/composer/editor/composer-attachment-preview";
import ComposerEditor from "@/features/sessions/components/composer/editor/composer-editor";
import ComposerReference from "@/features/sessions/components/composer/editor/composer-reference";
import {useComposerContext} from "@/features/sessions/hooks/composer/use-composer";
import {SESSION_ATTACHMENT_ACCEPT} from "@/features/sessions/lib/composer/attachments/session-attachments";
import type {ClientSlashCommandActions} from "@/features/sessions/lib/composer/editor/client-slash-commands";
import {
  contentPartsToEditorContent,
  editorToContentParts,
  textFromComposerContentParts,
  trimComposerContentParts,
} from "@/features/sessions/lib/composer/editor/composer-content-parts";
import {createSuggestionExtension} from "@/features/sessions/lib/composer/editor/composer-suggestions";
import type {SessionLiveStatus} from "@/features/sessions/stores/conversation/session-live-store";
import type {ComposerSuggestionMatch} from "@/features/sessions/types/composer-suggestion";
import {cn} from "@/lib/cn";

const DEFAULT_PLACEHOLDER = "Ask anything, @ to add files, or / for commands";

type ComposerClipboardEvent = ClipboardEvent<HTMLElement> | globalThis.ClipboardEvent;

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

// Tiptap's setHardBreak inserts via insertContent, which never marks the
// transaction with scrollIntoView. In the height-capped composer that leaves a
// freshly added line cut off at the bottom, so chain the scroll explicitly.
const ComposerHardBreak = HardBreak.extend({
  addKeyboardShortcuts() {
    return {
      "Mod-Enter": () => this.editor.chain().setHardBreak().scrollIntoView().run(),
      "Shift-Enter": () => this.editor.chain().setHardBreak().scrollIntoView().run(),
    };
  },
});

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

function ComposerAttachments() {
  const {attachments} = useComposerContext();

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

function ComposerAttachButton() {
  const {attachments, disabled} = useComposerContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachDisabled = disabled || attachments.isProcessing;

  const handleClick = (): void => {
    fileInputRef.current?.click();
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) attachments.addFiles(files);
    event.target.value = "";
  };

  return (
    <>
      <input accept={SESSION_ATTACHMENT_ACCEPT} className="hidden" disabled={attachDisabled} multiple onChange={handleChange} ref={fileInputRef} type="file" />
      <IconButton
        label="Attach files"
        className="grid size-8 place-items-center rounded-full text-ink-muted transition hover:bg-overlay-hover hover:text-ink-strong disabled:cursor-default disabled:text-ink-faint disabled:hover:bg-transparent"
        disabled={attachDisabled}
        onClick={handleClick}
        size="none"
        title="Attach files"
        variant="ghost"
      >
        <Icon name="plus" size="sm" />
      </IconButton>
    </>
  );
}

interface ComposerSubmitButtonProps {
  readonly canInterrupt: boolean;
  readonly canSubmit: boolean;
  readonly onClick: () => void;
  readonly streamStatus: SessionLiveStatus;
}

function ComposerSubmitButton(props: ComposerSubmitButtonProps) {
  const {canInterrupt, canSubmit, onClick, streamStatus} = props;
  const isStreaming = streamStatus === "streaming" || streamStatus === "stopping";
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
  /** Rendered below the composer surface, aligned left; the workspace pickers. The row's height is always reserved so the composer never shifts when it fills in. */
  readonly bottomBar?: ReactNode;
  /** Rendered on the toolbar between the attach and submit buttons; typically the pickers. */
  readonly children?: ReactNode;
  readonly onInterrupt?: () => void;
  readonly onSubmit: (contentParts: readonly UserMessageContentPart[]) => void;
  readonly placeholder?: string;
  readonly slashCommandActions?: ClientSlashCommandActions;
  readonly streamStatus?: SessionLiveStatus;
  /** Rendered above the composer surface, overlapping the timeline. */
  readonly topExtension?: ReactNode;
}

/** The message composer: editor, attachments, toolbar, and submit/stop. Reads its state from `ComposerContext`. */
export default function SessionComposer(props: SessionComposerProps) {
  const {bottomBar, children, onInterrupt, onSubmit, placeholder = DEFAULT_PLACEHOLDER, slashCommandActions, streamStatus = "idle", topExtension} = props;
  const {attachments, disabled, draft, projectPath} = useComposerContext();

  const [draftText, setDraftText] = useState(() => textFromComposerContentParts(draft.contentParts));
  const [suggestionMatch, setSuggestionMatch] = useState<ComposerSuggestionMatch | null>(null);

  const isStreaming = streamStatus === "streaming" || streamStatus === "stopping";
  const canSubmit = (draftText.trim().length > 0 || attachments.attachments.length > 0) && !disabled && !attachments.isProcessing && streamStatus === "idle";
  const canInterrupt = streamStatus === "streaming";

  const editor = useEditor(
    {
      editable: !disabled,
      content: contentPartsToEditorContent(draft.contentParts),
      editorProps: {
        attributes: {
          class: cn(
            "scroll-fade-y max-h-48 min-h-10 w-full min-w-0 overflow-y-auto whitespace-pre-wrap wrap-anywhere bg-transparent p-1 text-sm leading-5 text-ink outline-none",
            disabled && "cursor-default opacity-60"
          ),
        },
      },
      extensions: [Document, Paragraph, Text, ComposerHardBreak, History, ComposerReferenceNode, createSuggestionExtension(setSuggestionMatch)],
      onCreate: ({editor: currentEditor}) => {
        setDraftText(currentEditor.getText());
        if (draft.contentParts.length > 0) draft.setEditableContentParts(editorToContentParts(currentEditor));
      },
      onUpdate: ({editor: currentEditor}) => {
        setDraftText(currentEditor.getText());
        draft.setEditableContentParts(editorToContentParts(currentEditor));
      },
    },
    [disabled, draft.setEditableContentParts]
  );

  const submit = (): void => {
    if (!canSubmit) return;

    const trimmedContentParts = trimComposerContentParts(editor ? editorToContentParts(editor) : []);
    const textContentParts = trimmedContentParts.length > 0 ? trimmedContentParts : draftText.trim() ? [{text: draftText.trim(), type: "text" as const}] : [];
    onSubmit([...textContentParts, ...attachments.attachments]);
    editor?.commands.clearContent();
    setDraftText("");
    attachments.clear();
    draft.clear();
  };

  const handleSubmitButtonClick = (): void => {
    if (isStreaming) {
      if (canInterrupt) onInterrupt?.();
      return;
    }

    submit();
  };

  const handlePaste = (event: ComposerClipboardEvent): void => {
    const files = clipboardFiles(event);
    if (files.length === 0) return;

    event.preventDefault();
    if (disabled || attachments.isProcessing) return;

    attachments.addFiles(files);
  };

  return (
    <div className="relative px-4 pb-3 md:px-6">
      <div className="relative mx-auto max-w-3xl">
        {topExtension && (
          <div className="pointer-events-none absolute inset-x-0 bottom-full z-0">
            <div className="pointer-events-auto">{topExtension}</div>
          </div>
        )}
        <div className="relative z-10 rounded-3xl corner-superellipse/1.3 bg-surface-control px-3 py-2 ring-1 ring-border-muted shadow-md">
          <ComposerAttachments />
          <div className="relative -mx-3 px-3">
            <ComposerEditor
              editor={editor}
              onPaste={handlePaste}
              onSubmit={submit}
              onSuggestionMatchChange={setSuggestionMatch}
              placeholder={placeholder}
              projectPath={projectPath}
              slashCommandActions={slashCommandActions}
              suggestionMatch={suggestionMatch}
              value={draftText}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <ComposerAttachButton />
            <div className="flex min-w-0 items-center gap-2">
              {children}
              <ComposerSubmitButton canInterrupt={canInterrupt} canSubmit={canSubmit} onClick={handleSubmitButtonClick} streamStatus={streamStatus} />
            </div>
          </div>
        </div>
        <div className="flex h-8 items-center px-1">{bottomBar}</div>
      </div>
    </div>
  );
}
