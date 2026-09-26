import {AnimatePresence, motion, useReducedMotion} from "framer-motion";
import {MessageScrollerButton} from "@/features/sessions/components/timeline/viewport/message-scroller";

interface ScrollToEndButtonProps {
  /** Height of anything overlaying the bottom of the viewport, so the button sits above it. */
  readonly bottomOffset: number;
  readonly visible: boolean;
}

/** Floating "jump to latest" control. */
export default function ScrollToEndButton(props: ScrollToEndButtonProps) {
  const {bottomOffset, visible} = props;
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          animate={{opacity: 1, scale: 1, x: "-50%", y: 0, transition: {duration: 0.2, ease: [0.23, 1, 0.32, 1]}}}
          className="absolute left-1/2 z-10"
          exit={{opacity: 0, x: "-50%", transition: {duration: 0}}}
          initial={{opacity: 0, scale: 0.95, x: "-50%", y: shouldReduceMotion ? 0 : "100%"}}
          style={{bottom: `calc(1rem + ${bottomOffset}px)`}}
        >
          <MessageScrollerButton behavior="auto" className="static translate-x-0 bg-surface transition-colors hover:bg-surface-popover rtl:translate-x-0" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
