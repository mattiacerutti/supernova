import {memo, useMemo} from "react";
import AssistantMessage from "@/features/sessions/components/messages/assistant-message";
import {segmentStreamingMessage} from "@/features/sessions/lib/streaming-message-segments";
import type {StreamingMessageSegment} from "@/features/sessions/lib/streaming-message-segments";

const StreamingAssistantMessageSegment = memo(function StreamingAssistantMessageSegment(props: StreamingMessageSegment & {className?: string}) {
  const {className, mode, text} = props;
  return (
    <AssistantMessage className={className} mode={mode}>
      {text}
    </AssistantMessage>
  );
});

export default function StreamingAssistantMessage(props: {children: string; className?: string}) {
  const {children, className} = props;
  const segments = useMemo(() => segmentStreamingMessage(children), [children]);

  return (
    <div className="space-y-3">
      {segments.map((segment, index) => (
        <StreamingAssistantMessageSegment className={className} key={`${segment.mode}-${index}-${segment.text.length}`} mode={segment.mode} text={segment.text} />
      ))}
    </div>
  );
}
