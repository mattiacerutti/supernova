import type {AgentSessionAttachment} from "@pi-desktop/contracts/sessions/schemas";
import Icon from "@/components/ui/icon";
import {formatAttachmentType} from "@/features/sessions/lib/attachments/session-attachments";

interface MessageAttachmentPreviewProps {
  readonly attachment: AgentSessionAttachment;
}

function attachmentImageUrl(attachment: AgentSessionAttachment): string | undefined {
  if (!attachment.mime.startsWith("image/") || !attachment.contentBase64) return undefined;

  return `data:${attachment.mime};base64,${attachment.contentBase64}`;
}

export default function MessageAttachmentPreview(props: MessageAttachmentPreviewProps) {
  const {attachment} = props;
  const attachmentType = formatAttachmentType(attachment);
  const imageUrl = attachmentImageUrl(attachment);

  if (imageUrl) {
    return (
      <div className="overflow-hidden rounded-2xl corner-superellipse/1.4 bg-neutral-900 ring-1 ring-white/8">
        <img alt={attachment.name} className="block max-h-32 max-w-52 object-cover" src={imageUrl} />
      </div>
    );
  }

  return (
    <div className="flex max-w-full min-w-0 items-center gap-2 rounded-full border border-white/10 bg-neutral-800 px-3 py-2 ring-1 ring-white/5">
      <div className="grid size-5 shrink-0 place-items-center rounded-md bg-neutral-950 text-neutral-300">
        <Icon name="file" size="xs" />
      </div>

      <div className="min-w-0">
        <div className="max-w-72 truncate text-sm font-medium text-neutral-100" title={attachment.name}>
          {attachment.name}
        </div>
        <span className="sr-only">{attachmentType}</span>
      </div>
    </div>
  );
}
