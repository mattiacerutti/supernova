import type {UserMessageAttachmentPart} from "@supernova/contracts/sessions/schemas";
import Icon from "@/components/ui/icon";
import {formatAttachmentType} from "@/features/sessions/lib/attachments/session-attachments";

function attachmentImageUrl(attachment: UserMessageAttachmentPart): string | undefined {
  if (attachment.kind !== "image" || !attachment.contentBase64) return undefined;

  return `data:${attachment.mime};base64,${attachment.contentBase64}`;
}

interface MessageAttachmentPreviewProps {
  readonly attachment: UserMessageAttachmentPart;
}

export default function MessageAttachmentPreview(props: MessageAttachmentPreviewProps) {
  const {attachment} = props;
  const attachmentType = formatAttachmentType(attachment);
  const imageUrl = attachmentImageUrl(attachment);

  if (imageUrl) {
    return (
      <div className="size-24 overflow-hidden rounded-2xl corner-superellipse/1.4 bg-neutral-900 ring-1 ring-white/8">
        <img alt={attachment.name} className="block size-full object-cover object-center" src={imageUrl} />
      </div>
    );
  }

  return (
    <div className="flex max-w-60 min-w-0 items-center gap-0.5 rounded-full border border-white/5 bg-neutral-800 px-3 py-2 text-neutral-100 ring-1 ring-white/5">
      <div className="grid size-5 shrink-0 place-items-center">
        <Icon name="file" size="xs" />
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-medium" title={attachment.name}>
          {attachment.name}
        </div>
        <span className="sr-only">{attachmentType}</span>
      </div>
    </div>
  );
}
