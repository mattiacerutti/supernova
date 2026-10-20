import {animate, useReducedMotion} from "framer-motion";
import type {AnimationPlaybackControls} from "framer-motion";
import {useLayoutEffect, useRef, useState} from "react";
import {cn} from "@/lib/cn";
import "@/components/ui/rolling-text.css";

const DURATION = 0.55;
const EASE = [0.22, 1, 0.36, 1] as const;
const LAYOUT_TRANSITION = {duration: 0.2, ease: "easeOut"} as const;

interface Roll {
  readonly from: string;
  readonly to: string;
}

/** Never overlapping, so a label that only grows or shrinks still has one changed run. */
function sharedEnds(from: readonly string[], to: readonly string[]): readonly [number, number] {
  let prefix = 0;
  while (prefix < from.length && prefix < to.length && from[prefix] === to[prefix]) prefix += 1;
  let suffix = 0;
  const room = Math.min(from.length, to.length) - prefix;
  while (suffix < room && from[from.length - 1 - suffix] === to[to.length - 1 - suffix]) suffix += 1;
  return [prefix, suffix];
}

function wordXs(line: HTMLElement, words: readonly string[]): readonly number[] {
  const text = line.firstChild!;
  const left = line.getBoundingClientRect().left;
  const range = document.createRange();
  let offset = 0;
  return words.map((word) => {
    range.setStart(text, offset);
    offset += word.length;
    range.setEnd(text, offset);
    return range.getBoundingClientRect().left - left;
  });
}

interface RollLayerProps {
  readonly onDone: () => void;
  readonly paintClassName: string;
  readonly roll: Roll;
}

function RollLayer(props: RollLayerProps) {
  const {onDone, paintClassName, roll} = props;
  const ref = useRef<HTMLSpanElement>(null);
  const from = roll.from.match(/\s+|\S+/g) ?? [];
  const to = roll.to.match(/\s+|\S+/g) ?? [];
  const [prefix, suffix] = sharedEnds(from, to);
  const leaving = from.slice(prefix, from.length - suffix);
  const entering = to.slice(prefix, to.length - suffix);

  // Measured and started before the first paint; the layer is keyed per roll, so this runs once.
  useLayoutEffect(() => {
    const layer = ref.current!;
    const label = layer.parentElement!;
    const [fromLine, toLine] = layer.querySelectorAll<HTMLElement>("[data-line]");
    const fromXs = wordXs(fromLine!, from);
    const toXs = wordXs(toLine!, to);
    const controls: AnimationPlaybackControls[] = [];

    const rollWords = (selector: string, xs: readonly number[], keyframes: Parameters<typeof animate>[1]) => {
      const elements = layer.querySelectorAll<HTMLElement>(selector);
      elements.forEach((element, index) => {
        element.style.setProperty("--rolling-word-x", `${xs[prefix + index]}px`);
        const delay = (DURATION * 0.15 * index) / elements.length;
        controls.push(animate(element, keyframes, {delay, duration: DURATION, ease: EASE}));
      });
    };
    // `top` rather than a transform: a transform resamples the glyph at a new subpixel offset every frame, which reads as jitter.
    rollWords("[data-leaving]", fromXs, {opacity: [1, 0], top: ["0%", "-100%"]});
    rollWords("[data-entering]", toXs, {opacity: [0, 1], top: ["100%", "0%"]});

    let cancelled = false;
    void Promise.all(controls).then(() => !cancelled && onDone());

    const suffixElement = layer.querySelector<HTMLElement>("[data-suffix]");
    if (suffixElement) {
      const x = toXs[to.length - suffix]!;
      controls.push(animate(suffixElement, {"--rolling-word-x": [`${fromXs[from.length - suffix]}px`, `${x}px`]}, LAYOUT_TRANSITION));
    }
    controls.push(animate(label, {width: [fromLine!.getBoundingClientRect().width, toLine!.getBoundingClientRect().width]}, LAYOUT_TRANSITION));

    return () => {
      cancelled = true;
      controls.forEach((control) => control.stop());
      label.style.width = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-clip whitespace-pre" ref={ref}>
      <span className="invisible absolute" data-line>
        {roll.from}
      </span>
      <span className="invisible absolute" data-line>
        {roll.to}
      </span>
      <span className={cn("absolute", paintClassName)}>{to.slice(0, prefix).join("")}</span>
      {leaving.map((word, index) => (
        <span className={cn("absolute", paintClassName)} data-leaving key={index}>
          {word}
        </span>
      ))}
      {entering.map((word, index) => (
        <span className={cn("absolute top-full opacity-0", paintClassName)} data-entering key={index}>
          {word}
        </span>
      ))}
      {suffix > 0 && (
        <span className={cn("absolute", paintClassName)} data-suffix>
          {to.slice(to.length - suffix).join("")}
        </span>
      )}
    </span>
  );
}

interface RollingTextProps {
  readonly animateOnMount?: boolean;
  readonly children: string;
  readonly className?: string;
  readonly shimmer?: boolean;
}

export default function RollingText(props: RollingTextProps) {
  const {animateOnMount = false, children, className, shimmer = false} = props;
  const reduceMotion = useReducedMotion();
  const [text, setText] = useState(children);
  const [roll, setRoll] = useState<Roll | null>(() => (animateOnMount && !reduceMotion && children ? {from: "", to: children} : null));

  if (text !== children) {
    setText(children);
    setRoll(reduceMotion ? null : {from: text, to: children});
  }

  const paintClassName = cn(
    "left-[var(--rolling-word-x,0px)]",
    shimmer && "shimmer shimmer-angle-0 animate-none bg-size-[40rem_100%] bg-repeat bg-position-[calc(var(--rolling-shimmer-offset)-var(--rolling-word-x,0px))_0]"
  );

  return (
    <span
      className={cn(
        "relative inline-flex min-w-0 max-w-full",
        shimmer && "animate-[rolling-shimmer_var(--shimmer-duration,2s)_linear_infinite] motion-reduce:animate-none",
        className
      )}
    >
      {/* The plain label holds the layout and stays readable to assistive technology; it is only hidden while a roll draws. */}
      <span className={cn("min-w-0 truncate whitespace-pre", paintClassName, roll && "opacity-0")}>{children}</span>
      {/* Consecutive rolls always end on different text, so this remounts the layer for each change. */}
      {roll && <RollLayer key={roll.to} onDone={() => setRoll(null)} paintClassName={paintClassName} roll={roll} />}
    </span>
  );
}
