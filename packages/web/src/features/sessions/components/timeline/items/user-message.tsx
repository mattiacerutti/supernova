import type {UserMessage as UserMessageModel} from "@supernova/contracts/sessions/schemas";
import Icon from "@/components/ui/icon";
import MessageAttachmentPreview from "@/features/sessions/components/attachments/message-attachment-preview";
import MessageActions from "@/features/sessions/components/timeline/items/actions/message-actions";
import {textFromComposerContentParts} from "@/features/sessions/lib/composer/composer-content-parts";
import {cn} from "@/lib/cn";

// TODO: Review these components and possibly refactor

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

function ReferenceContentPart(props: {part: Extract<NonNullable<UserMessageModel["contentParts"]>[number], {type: "reference"}>}) {
  const {part} = props;
  const iconName = part.kind === "skill" ? "skill" : part.value.endsWith("/") ? "folder" : "file";

  return (
    <span className="mx-1 inline-flex items-baseline gap-1 whitespace-nowrap align-baseline leading-[inherit] text-sky-300">
      <Icon className="relative top-px size-[1em] text-sky-300" name={iconName} size="xs" />
      <span>{part.name}</span>
    </span>
  );
}

function UserMessageStructuredContent(props: {message: UserMessageModel}) {
  const {message} = props;

  return (
    <span className="whitespace-pre-wrap">
      {message.contentParts.map((part, index) => {
        if (part.type === "text") return <UserMessageContent key={`text-${index}`}>{part.text}</UserMessageContent>;
        if (part.type === "attachment") return null;
        return <ReferenceContentPart key={part.id} part={part} />;
      })}
    </span>
  );
}

interface UserMessageProps {
  message: UserMessageModel;
}

export default function UserMessage(props: UserMessageProps) {
  const {message} = props;
  const attachments = message.contentParts.filter((part) => part.type === "attachment");
  const hasContent = message.contentParts.some((part) => part.type !== "attachment" && (part.type === "reference" || part.text.trim().length > 0));
  const copyText = textFromComposerContentParts(message.contentParts);

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
        <MessageActions align="end" copyText={copyText} />
      </div>
    </article>
  );
}
