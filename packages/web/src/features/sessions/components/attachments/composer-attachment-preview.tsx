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
      <div className="relative size-24 overflow-hidden rounded-2xl corner-superellipse/1.4 bg-neutral-900 ring-1 ring-white/8">
        <img alt={attachment.name} className="block size-full object-cover object-center" src={imageUrl} />
        <button
          aria-label={`Remove ${attachment.name}`}
          className="absolute right-1.5 top-1.5 grid size-5 cursor-pointer place-items-center rounded-full bg-neutral-100 text-neutral-950 opacity-90 transition hover:scale-105 hover:bg-white"
          onClick={handleRemove}
          type="button"
        >
          <Icon name="x" size="xs" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex w-72 max-w-full min-w-0 items-center gap-3 rounded-2xl border border-white/8 bg-neutral-800/70 py-2 pl-2 pr-9 ring-1 ring-white/4">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-neutral-950 text-neutral-300">
        <Icon name="file" size="md" />
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-neutral-100" title={attachment.name}>
          {attachment.name}
        </div>
        <span className="sr-only">{attachmentType}</span>
      </div>

      <button
        aria-label={`Remove ${attachment.name}`}
        className="absolute right-2 top-2 grid size-6 cursor-pointer place-items-center rounded-full bg-neutral-100 text-neutral-950 transition hover:scale-105 hover:bg-white"
        onClick={handleRemove}
        type="button"
      >
        <Icon name="x" size="xs" />
      </button>
    </div>
  );
}
