import type {AnimationEvent} from "react";
import {useState} from "react";
import {cn} from "@/lib/cn";

interface SessionTitleRevealState {
  readonly revealingTitle: string | null;
  readonly title: string;
}

interface SessionTitleTextProps {
  readonly className?: string;
  readonly title: string;
}

export default function SessionTitleText(props: SessionTitleTextProps) {
  const {className, title} = props;
  const [revealState, setRevealState] = useState<SessionTitleRevealState>(() => ({revealingTitle: null, title}));

  if (revealState.title !== title) {
    setRevealState({revealingTitle: title, title});
  }

  const revealing = revealState.revealingTitle === title;

  const handleAnimationEnd = (event: AnimationEvent<HTMLSpanElement>): void => {
    if (event.animationName !== "session-title-reveal") return;

    setRevealState((state) => (state.revealingTitle === title ? {...state, revealingTitle: null} : state));
  };

  return (
    <span className={cn(className, revealing && "session-title-reveal")} key={title} onAnimationEnd={handleAnimationEnd}>
      {title}
    </span>
  );
}
