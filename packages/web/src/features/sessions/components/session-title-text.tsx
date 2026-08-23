import type {AnimationEvent} from "react";
import {useState} from "react";
import {cn} from "@/lib/cn";

function shouldRevealTitleChange(previousTitle: string, nextTitle: string): boolean {
  return previousTitle.trim() === "Untitled session" && nextTitle.trim().length > 0 && previousTitle !== nextTitle;
}

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
    setRevealState({revealingTitle: shouldRevealTitleChange(revealState.title, title) ? title : null, title});
  }

  const revealing = revealState.revealingTitle === title;

  const handleAnimationEnd = (event: AnimationEvent<HTMLSpanElement>): void => {
    if (event.animationName !== "session-title-reveal") return;

    setRevealState((state) => (state.revealingTitle === title ? {...state, revealingTitle: null} : state));
  };

  return (
    <span
      className={cn(className, revealing && "origin-left animate-[session-title-reveal_520ms_cubic-bezier(0.22,1,0.36,1)_both]")}
      key={title}
      onAnimationEnd={handleAnimationEnd}
    >
      {title}
    </span>
  );
}
