import {animate, useReducedMotion} from "framer-motion";
import type {AnimationPlaybackControls} from "framer-motion";
import type {AnimationEvent, PointerEvent} from "react";
import {useRef, useState} from "react";
import {cn} from "@/lib/cn";

/** Reading pace for revealing a hidden title, slow enough to follow the words. */
const REVEAL_SPEED_PX_PER_SECOND = 22;
const REVEAL_DELAY_SECONDS = 0.55;

function shouldRevealTitleChange(previousTitle: string, nextTitle: string): boolean {
  return previousTitle.trim() === "Untitled session" && nextTitle.trim().length > 0 && previousTitle !== nextTitle;
}

interface SessionTitleRevealState {
  readonly revealingTitle: string | null;
  readonly title: string;
}

interface SessionTitleTextProps {
  readonly className?: string;
  /** Scrolls an overflowing title to its end while the pointer rests on it. Leaving snaps it back. */
  readonly revealOnHover?: boolean;
  readonly title: string;
}

export default function SessionTitleText(props: SessionTitleTextProps) {
  const {className, revealOnHover = false, title} = props;
  const [revealState, setRevealState] = useState<SessionTitleRevealState>(() => ({revealingTitle: null, title}));
  const reveal = useRef<AnimationPlaybackControls | null>(null);
  const reducedMotion = useReducedMotion();

  if (revealState.title !== title) {
    setRevealState({revealingTitle: shouldRevealTitleChange(revealState.title, title) ? title : null, title});
  }

  const revealing = revealState.revealingTitle === title;

  const handleAnimationEnd = (event: AnimationEvent<HTMLSpanElement>): void => {
    if (event.animationName !== "session-title-reveal") return;

    setRevealState((state) => (state.revealingTitle === title ? {...state, revealingTitle: null} : state));
  };

  // Animating scrollLeft keeps the shared scroll fade in sync with the position, which a transform
  // would not. Its pace comes from how much is hidden, so every title reads at the same speed.
  const handlePointerEnter = (event: PointerEvent<HTMLSpanElement>): void => {
    const element = event.currentTarget;
    const hidden = element.scrollWidth - element.clientWidth;
    if (hidden < 1 || reducedMotion) return;

    reveal.current = animate(0, hidden, {
      delay: REVEAL_DELAY_SECONDS,
      duration: hidden / REVEAL_SPEED_PX_PER_SECOND,
      ease: "linear",
      onUpdate: (left) => {
        element.scrollLeft = left;
      },
    });
  };

  const handlePointerLeave = (event: PointerEvent<HTMLSpanElement>): void => {
    // Snapping back keeps the row's resting state instant; only the reveal is paced for reading.
    reveal.current?.stop();
    event.currentTarget.scrollLeft = 0;
  };

  const hoverProps = revealOnHover ? {onPointerEnter: handlePointerEnter, onPointerLeave: handlePointerLeave} : {};

  return (
    <span
      {...hoverProps}
      className={cn(className, revealing && "origin-left animate-[session-title-reveal_520ms_cubic-bezier(0.22,1,0.36,1)_both]")}
      key={title}
      onAnimationEnd={handleAnimationEnd}
      ref={() => () => reveal.current?.stop()}
    >
      {title}
    </span>
  );
}
