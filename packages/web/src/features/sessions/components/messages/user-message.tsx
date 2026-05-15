import type {SessionUserMessage} from "@pi-desktop/contracts/sessions/schemas";
import Icon from "@/components/ui/icon";
import MessageAttachmentPreview from "@/features/sessions/components/attachments/message-attachment-preview";
import MessageActions from "@/features/sessions/components/messages/message-actions";
import {textFromComposerContentParts} from "@/features/sessions/lib/composer/composer-content-parts";
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

function contentPartsMatchMessage(message: SessionUserMessage): boolean {
  const contentParts = message.contentParts;
  if (!contentParts?.length) return false;
  return textFromComposerContentParts(contentParts) === message.content;
}

function ReferenceContentPart(props: {part: Extract<NonNullable<SessionUserMessage["contentParts"]>[number], {type: "reference"}>}) {
  const {part} = props;

  return (
    <span className="mx-0.5 inline whitespace-nowrap align-baseline text-sky-300">
      {part.kind === "file" && <Icon className="mr-1 inline-block size-[1em] align-[-0.13em] text-sky-300" name="file" size="xs" />}
      <span>{part.title}</span>
    </span>
  );
}

function UserMessageStructuredContent(props: {message: SessionUserMessage}) {
  const {message} = props;

  if (!contentPartsMatchMessage(message)) return <UserMessageContent>{message.content}</UserMessageContent>;

  return (
    <span className="whitespace-pre-wrap">
      {message.contentParts?.map((part, index) => {
        if (part.type === "text") return <UserMessageContent key={`text-${index}`}>{part.text}</UserMessageContent>;
        return <ReferenceContentPart key={part.id} part={part} />;
      })}
    </span>
  );
}

interface UserMessageProps {
  message: SessionUserMessage;
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
          {hasContent ? <UserMessageStructuredContent message={message} /> : "(No content)"}
        </div>
        <MessageActions align="end" copyText={message.content} />
      </div>
    </article>
  );
}
