import type {UserMessageAttachmentPart} from "@supernova/contracts/sessions/schemas";
import Icon from "@/components/ui/icon";
import {formatAttachmentType} from "@/features/sessions/lib/attachments/session-attachments";

function attachmentImageUrl(attachment: UserMessageAttachmentPart): string | undefined {
  if (attachment.kind !== "image" || !attachment.contentBase64) return undefined;

  return `data:${attachment.mime};base64,${attachment.contentBase64}`;
}

interface ComposerAttachmentPreviewProps {
  readonly attachment: UserMessageAttachmentPart;
  readonly onRemove: (attachmentId: string) => void;
}

export default function ComposerAttachmentPreview(props: ComposerAttachmentPreviewProps) {
  const {attachment, onRemove} = props;
  const attachmentType = formatAttachmentType(attachment);
  const imageUrl = attachmentImageUrl(attachment);

  const handleRemove = (): void => {
    onRemove(attachment.id);
  };

  if (imageUrl) {
    return (
      <div className="relative size-24 overflow-hidden rounded-2xl corner-superellipse/1.4 bg-surface-control ring-1 ring-border-muted">
        <img alt={attachment.name} className="block size-full object-cover object-center" src={imageUrl} />
        <button
          aria-label={`Remove ${attachment.name}`}
          className="absolute right-1.5 top-1.5 grid size-5 cursor-pointer place-items-center rounded-full bg-ink-strong text-ink-inverse opacity-90 transition hover:scale-105 hover:bg-ink-strong"
          onClick={handleRemove}
          type="button"
        >
          <Icon name="x" size="xs" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex w-72 max-w-full min-w-0 items-center gap-3 rounded-2xl border border-border-muted bg-surface-raised/70 py-2 pl-2 pr-9 ring-1 ring-border-muted">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-control text-ink">
        <Icon name="file" size="md" />
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-ink-strong" title={attachment.name}>
          {attachment.name}
        </div>
        <span className="sr-only">{attachmentType}</span>
      </div>

      <button
        aria-label={`Remove ${attachment.name}`}
        className="absolute right-2 top-2 grid size-6 cursor-pointer place-items-center rounded-full bg-ink-strong text-ink-inverse transition hover:scale-105 hover:bg-ink-strong"
        onClick={handleRemove}
        type="button"
      >
        <Icon name="x" size="xs" />
      </button>
    </div>
  );
}
