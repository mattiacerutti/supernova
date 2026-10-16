import {animate, useReducedMotion} from "framer-motion";
import type {AnimationPlaybackControls} from "framer-motion";
import {useLayoutEffect, useRef, useState} from "react";
import {cn} from "@/lib/cn";

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

function characterXs(line: HTMLElement, characters: readonly string[]): readonly number[] {
  const text = line.firstChild!;
  const left = line.getBoundingClientRect().left;
  const range = document.createRange();
  let offset = 0;
  return characters.map((character) => {
    range.setStart(text, offset);
    offset += character.length;
    range.setEnd(text, offset);
    return range.getBoundingClientRect().left - left;
  });
}

interface RollLayerProps {
  readonly onDone: () => void;
  readonly roll: Roll;
}

function RollLayer(props: RollLayerProps) {
  const {onDone, roll} = props;
  const ref = useRef<HTMLSpanElement>(null);
  const from = Array.from(roll.from);
  const to = Array.from(roll.to);
  const [prefix, suffix] = sharedEnds(from, to);
  const leaving = from.slice(prefix, from.length - suffix);
  const entering = to.slice(prefix, to.length - suffix);

  // Measured and started before the first paint; the layer is keyed per roll, so this runs once.
  useLayoutEffect(() => {
    const layer = ref.current!;
    const label = layer.parentElement!;
    const [fromLine, toLine] = layer.querySelectorAll<HTMLElement>("[data-line]");
    const fromXs = characterXs(fromLine!, from);
    const toXs = characterXs(toLine!, to);
    const controls: AnimationPlaybackControls[] = [];

    const rollCharacters = (selector: string, xs: readonly number[], keyframes: Parameters<typeof animate>[1]) => {
      const elements = layer.querySelectorAll<HTMLElement>(selector);
      elements.forEach((element, index) => {
        element.style.left = `${xs[prefix + index]}px`;
        const delay = (DURATION * 0.15 * index) / elements.length;
        controls.push(animate(element, keyframes, {delay, duration: DURATION, ease: EASE}));
      });
    };
    // `top` rather than a transform: a transform resamples the glyph at a new subpixel offset every frame, which reads as jitter.
    rollCharacters("[data-leaving]", fromXs, {opacity: [1, 0], top: ["0%", "-100%"]});
    rollCharacters("[data-entering]", toXs, {opacity: [0, 1], top: ["100%", "0%"]});

    let cancelled = false;
    void Promise.all(controls).then(() => !cancelled && onDone());

    const suffixElement = layer.querySelector<HTMLElement>("[data-suffix]");
    if (suffixElement) {
      const x = toXs[to.length - suffix]!;
      suffixElement.style.left = `${x}px`;
      controls.push(animate(suffixElement, {x: [fromXs[from.length - suffix]! - x, 0]}, LAYOUT_TRANSITION));
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
      <span className="absolute left-0">{to.slice(0, prefix).join("")}</span>
      {leaving.map((character, index) => (
        <span className="absolute" data-leaving key={index}>
          {character}
        </span>
      ))}
      {entering.map((character, index) => (
        <span className="absolute top-full opacity-0" data-entering key={index}>
          {character}
        </span>
      ))}
      {suffix > 0 && (
        <span className="absolute" data-suffix>
          {to.slice(to.length - suffix).join("")}
        </span>
      )}
    </span>
  );
}

interface RollingTextProps {
  readonly children: string;
  /** Applied to the label only: a background clipped to text (the shimmer) would mask the rolling glyphs at their resting places. */
  readonly className?: string;
}

export default function RollingText(props: RollingTextProps) {
  const {children, className} = props;
  const reduceMotion = useReducedMotion();
  const [text, setText] = useState(children);
  const [roll, setRoll] = useState<Roll | null>(null);

  if (text !== children) {
    setText(children);
    setRoll(reduceMotion ? null : {from: text, to: children});
  }

  return (
    <span className="relative inline-flex min-w-0 max-w-full">
      {/* The plain label holds the layout and stays readable to assistive technology; it is only hidden while a roll draws. */}
      <span className={cn("min-w-0 truncate whitespace-pre", className, roll && "opacity-0")}>{children}</span>
      {/* Consecutive rolls always end on different text, so this remounts the layer for each change. */}
      {roll && <RollLayer key={roll.to} onDone={() => setRoll(null)} roll={roll} />}
    </span>
  );
}
