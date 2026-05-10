import type {IAgentSessionUserMessage} from "@pi-desktop/contracts/sessions";
import MessageActions from "@/features/sessions/components/messages/message-actions";

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

interface IUserMessageProps {
  message: IAgentSessionUserMessage;
}

export default function UserMessage(props: IUserMessageProps) {
  const {message} = props;

  return (
    <article className="group/message flex justify-end">
      <div className="max-w-lg">
        <div className="rounded-2xl corner-superellipse/1.3 bg-neutral-800 px-3.5 py-2 text-sm leading-relaxed text-neutral-200">
          <UserMessageContent>{message.content}</UserMessageContent>
        </div>
        <MessageActions align="end" copyText={message.content} />
      </div>
    </article>
  );
}
