import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import SessionActionsMenu from "@/features/sessions/components/session-actions-menu";
import SessionTitleText from "@/features/sessions/components/session-title-text";
import {useRenameSession} from "@/features/sessions/hooks/api/use-rename-session";
import {useInlineRename} from "@/hooks/use-inline-rename";
import {cn} from "@/lib/cn";

interface ProjectSessionListItemProps {
  session: {id: string; title: string; pinned: boolean; updatedAt: string};
  projectPath: string;
  selected: boolean;
  streaming: boolean;
  unseen: boolean;
  onOpen: () => void;
  onPrefetch: () => void;
  onTogglePinned: () => void;
}

/** Renders a sidebar session with shared actions and local inline renaming. */
export default function ProjectSessionListItem(props: ProjectSessionListItemProps) {
  const {session, projectPath, selected, streaming, unseen, onOpen, onPrefetch, onTogglePinned} = props;
  const renameSession = useRenameSession();
  const {draftName, handleBlur, handleChange, handleClick, handleFocus, handleInputRef, handleKeyDown, renaming, startRenaming} = useInlineRename({
    initialValue: session.title,
    onSave: (title) => renameSession.mutate({sessionId: session.id, title}),
  });

  return (
    <li onFocusCapture={onPrefetch} onPointerDown={onPrefetch} onPointerEnter={onPrefetch}>
      <Button
        as="div"
        className={cn("group/session flex w-full items-center gap-2 py-1.5 pl-2 pr-1 text-left", selected && "bg-overlay-pressed text-ink")}
        onClick={onOpen}
        variant="primary"
      >
        <IconButton
          className={cn("group/pin-toggle size-4 shrink-0", !session.pinned && "invisible group-hover/session:visible")}
          label={session.pinned ? "Unpin session" : "Pin session"}
          onClick={(event) => {
            event.stopPropagation();
            onTogglePinned();
          }}
        >
          <Icon
            className="origin-center transition-transform duration-250 ease-[cubic-bezier(0.2,0.9,0.2,1.15)] group-active/pin-toggle:scale-85 group-active/pin-toggle:-rotate-8 motion-reduce:transition-none"
            name="pin"
            size="xs"
          />
        </IconButton>
        {renaming && (
          <input
            aria-label="Session title"
            className="min-w-0 flex-1 truncate bg-transparent text-sm outline-none"
            onBlur={handleBlur}
            onChange={handleChange}
            onClick={handleClick}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            onPointerDown={(event) => event.stopPropagation()}
            ref={handleInputRef}
            value={draftName}
          />
        )}
        {!renaming && <SessionTitleText className="min-w-0 flex-1 truncate text-sm" title={session.title} />}
        <span className="grid w-12 shrink-0 place-items-center justify-items-end">
          <span className="col-start-1 row-start-1 w-full justify-self-end whitespace-nowrap pr-1.5 text-right text-xs text-ink-muted group-hover/session:invisible group-focus-within/session:invisible group-has-[[data-popup-open]]/session:invisible">
            {streaming ? (
              <span className="inline-block size-2 animate-spin rounded-full border border-border-strong border-t-ink" aria-label="Session streaming" />
            ) : unseen ? (
              <span className="inline-block size-1.5 rounded-full bg-accent" aria-label="Finished while closed" role="status" />
            ) : (
              session.updatedAt
            )}
          </span>
          <SessionActionsMenu
            onRename={startRenaming}
            projectPath={projectPath}
            sessionId={session.id}
            sessionTitle={session.title}
            triggerClassName="col-start-1 row-start-1 size-5 opacity-0 group-hover/session:opacity-100 group-focus-within/session:opacity-100 data-popup-open:opacity-100"
          />
        </span>
      </Button>
    </li>
  );
}
