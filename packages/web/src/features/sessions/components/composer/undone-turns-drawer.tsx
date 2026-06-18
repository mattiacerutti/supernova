import type {Turn, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {AnimatePresence, motion} from "framer-motion";
import {useLayoutEffect, useRef, useState} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import {cn} from "@/lib/cn";

const DRAWER_TRANSITION = {duration: 0.2, ease: "easeOut"} as const;

function contentPartKey(part: UserMessageContentPart, index: number): string {
  if (part.type === "reference") return part.id;
  if (part.type === "attachment") return part.id;
  return `text-${part.text.slice(0, 20)}-${index}`;
}

function UndoneTurnTitle(props: {readonly contentParts: readonly UserMessageContentPart[]}) {
  const {contentParts} = props;
  const titleParts = contentParts.filter((part) => part.type === "text" || part.type === "reference");
  const hasTitle = titleParts.some((part) => part.type === "reference" || part.text.trim().length > 0);

  if (!hasTitle) return <span className="text-neutral-500">(No content)</span>;

  return (
    <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
      {titleParts.map((part, index) => {
        if (part.type === "text") return <span key={contentPartKey(part, index)}>{part.text}</span>;

        return (
          <span className="mx-1 inline-flex items-baseline gap-1 whitespace-nowrap align-baseline leading-[inherit] text-sky-300" key={contentPartKey(part, index)}>
            <Icon className="relative top-px size-[1em] text-sky-300" name={part.kind === "skill" ? "skill" : part.value.endsWith("/") ? "folder" : "file"} size="xs" />
            <span>{part.name}</span>
          </span>
        );
      })}
    </span>
  );
}

interface UndoneTurnsDrawerProps {
  readonly disabled?: boolean;
  readonly onHeightChange?: (height: number) => void;
  readonly onRevertToMessage: (turnId: string) => void;
  readonly turns: readonly Turn[];
}

export default function UndoneTurnsDrawer(props: UndoneTurnsDrawerProps) {
  const {disabled = false, onHeightChange, onRevertToMessage, turns} = props;
  const [expanded, setExpanded] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const visible = turns.length > 0;
  const count = turns.length;
  const previewTurn = turns[0];

  useLayoutEffect(() => {
    if (!onHeightChange) return;

    const drawer = drawerRef.current;
    if (!drawer) {
      onHeightChange(0);
      return;
    }

    const updateHeight = (): void => {
      // Subtracts 20px to account for the drawer's bottom overlap with the composer
      onHeightChange(Math.max(0, drawer.getBoundingClientRect().height - 20));
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(drawer);

    return () => observer.disconnect();
  }, [expanded, onHeightChange, visible]);

  const handleToggle = (): void => {
    setExpanded((current) => !current);
  };

  const handleExitComplete = (): void => {
    setExpanded(false);
    onHeightChange?.(0);
  };

  return (
    <AnimatePresence initial={false} onExitComplete={handleExitComplete}>
      {visible && (
        <motion.div
          animate={{height: "auto", opacity: 1, y: 0}}
          className="-mb-5 overflow-hidden"
          exit={{height: 0, opacity: 0, y: 8}}
          initial={{height: 0, opacity: 0, y: 8}}
          ref={drawerRef}
          transition={DRAWER_TRANSITION}
        >
          <div className="min-h-0 min-w-0 overflow-hidden">
            <div className="relative mx-px rounded-t-3xl corner-superellipse/1.3 border border-white/8 bg-[#151515] px-4 pb-7 pt-2.5">
              <div className={cn("flex items-center justify-between gap-3 px-1", expanded && "mb-3")}>
                <div className="flex min-w-0 items-center gap-2 text-sm text-neutral-300">
                  <span className="shrink-0 font-medium">
                    {count} rolled back {count === 1 ? "message" : "messages"}
                  </span>
                  {!expanded && previewTurn && (
                    <span className="min-w-0 truncate text-neutral-500">
                      <UndoneTurnTitle contentParts={previewTurn.userMessage.contentParts} />
                    </span>
                  )}
                </div>
                <Button
                  aria-expanded={expanded}
                  aria-label={expanded ? "Collapse rolled back messages" : "Expand rolled back messages"}
                  className="w-auto shrink-0"
                  onClick={handleToggle}
                  shape="icon"
                  size="sm"
                  variant="ghost"
                >
                  <motion.span animate={{rotate: expanded ? 180 : 0}} className="inline-grid" transition={DRAWER_TRANSITION}>
                    <Icon name="chevron-down" size="xs" />
                  </motion.span>
                </Button>
              </div>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div animate={{height: "auto", opacity: 1}} exit={{height: 0, opacity: 0}} initial={{height: 0, opacity: 0}} transition={DRAWER_TRANSITION}>
                    <div className="min-h-0 min-w-0 overflow-visible">
                      <motion.div
                        animate={{opacity: 1, y: 0}}
                        className="max-h-40 space-y-1 overflow-x-hidden overflow-y-auto pr-1 pb-0.5"
                        initial={{opacity: 0, y: 4}}
                        transition={DRAWER_TRANSITION}
                      >
                        {turns.map((turn) => {
                          const handleRevert = (): void => {
                            onRevertToMessage(turn.id);
                          };

                          return (
                            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 overflow-hidden px-1 text-sm text-neutral-200" key={turn.id}>
                              <div className="min-w-0 flex-1 overflow-hidden truncate whitespace-nowrap leading-relaxed">
                                <UndoneTurnTitle contentParts={turn.userMessage.contentParts} />
                              </div>
                              <Button
                                aria-label="Restore rolled back message"
                                className="w-auto shrink-0 whitespace-nowrap"
                                disabled={disabled}
                                onClick={handleRevert}
                                size="sm"
                                title="Restore this message"
                                variant="primary"
                              >
                                Restore message
                              </Button>
                            </div>
                          );
                        })}
                      </motion.div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
