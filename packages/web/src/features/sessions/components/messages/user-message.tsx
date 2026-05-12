import type {AgentSessionUserMessage} from "@pi-desktop/contracts/sessions/schemas";
import MessageAttachmentPreview from "@/features/sessions/components/attachments/message-attachment-preview";
import MessageActions from "@/features/sessions/components/messages/message-actions";
import {cn} from "@/lib/cn";

function UserMessageContent(props: {children: string}) {
  const {children} = props;
  const parts = children.split(/(`[^`]+`)/g);

  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, index) => {
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code className="rounded bg-white/8 px-1 py-0.5 font-mono text-xs text-neutral-200" key={`${part}-${index}`}>
              {part.slice(1, -1)}
            </code>
          );
        }

        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </span>
  );
}

interface UserMessageProps {
  message: AgentSessionUserMessage;
}

export default function UserMessage(props: UserMessageProps) {
  const {message} = props;
  const hasContent = message.content.trim().length > 0;
  const attachments = message.attachments ?? [];

  return (
    <article className="group/message flex justify-end">
      <div className="flex max-w-lg flex-col items-end gap-2">
        {attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {attachments.map((attachment) => (
              <MessageAttachmentPreview attachment={attachment} key={attachment.id} />
            ))}
          </div>
        )}

        <div className={cn("rounded-2xl corner-superellipse/1.3 bg-neutral-800 px-3.5 py-2 text-sm leading-relaxed text-neutral-200", !hasContent && "text-neutral-400")}>
          {hasContent ? <UserMessageContent>{message.content}</UserMessageContent> : "(No content)"}
        </div>
        <MessageActions align="end" copyText={message.content} />
      </div>
    </article>
  );
}
