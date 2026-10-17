import {useReducedMotion} from "framer-motion";
import {useState} from "react";
import type {ReactNode} from "react";
import {cn} from "@/lib/cn";

interface WorkExpansionBodyProps {
  readonly children: ReactNode;
  readonly expanded: boolean;
  readonly turn?: boolean;
}

export default function WorkExpansionBody(props: WorkExpansionBodyProps) {
  const {children, expanded, turn = false} = props;
  const reduceMotion = useReducedMotion();
  const [present, setPresent] = useState(expanded);
  if (expanded && !present) setPresent(true);

  return (
    <div
      className={cn(
        "grid grid-rows-[0fr] transition-[grid-template-rows] motion-reduce:transition-none data-[expanded=true]:grid-rows-[1fr]",
        turn ? "opacity-0 transition-[grid-template-rows,opacity] duration-300 ease-in-out data-[expanded=true]:opacity-100" : "duration-150 ease-out"
      )}
      data-expanded={expanded}
      inert={!expanded}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "grid-template-rows" && !expanded) setPresent(false);
      }}
    >
      <div className="min-h-0 overflow-hidden">
        <div className={turn ? "pt-3" : "pt-0.5"}>{present && (!reduceMotion || expanded) && children}</div>
      </div>
    </div>
  );
}
