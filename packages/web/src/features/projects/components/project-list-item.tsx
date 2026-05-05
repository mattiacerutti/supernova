import {useState} from "react";
import type {MouseEvent} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import Menu, {MenuItem} from "@/components/ui/menu";
import type {IProjectListProject} from "@/features/projects/types/project-list";
import {useArchiveProjectSession} from "@/features/projects/hooks/api/use-archive-project-session";
import {useListProjectSessions} from "@/features/projects/hooks/api/use-list-project-sessions";
import {useRenameProject} from "@/features/projects/hooks/use-rename-project";
import {useProjectsStore} from "@/features/projects/stores/projects-store";
import {formatUpdatedAt} from "@/features/projects/utils/format-updated-at";
import {cn} from "@/lib/cn";

const INITIAL_CHAT_LIMIT = 5;
const CHAT_LIMIT_INCREMENT = 5;

interface IProjectListItemProps {
  expanded: boolean;
  project: IProjectListProject;
  onToggle: (projectId: string) => void;
}

export default function ProjectListItem(props: IProjectListItemProps) {
  const {expanded, onToggle, project} = props;

  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [loadedChatLimit, setLoadedChatLimit] = useState(INITIAL_CHAT_LIMIT);
  const [visibleChatLimit, setVisibleChatLimit] = useState(INITIAL_CHAT_LIMIT);
  const [confirmingArchiveChatId, setConfirmingArchiveChatId] = useState<string | null>(null);
  const removeProject = useProjectsStore((state) => state.removeProject);
  const toggleChatPinned = useProjectsStore((state) => state.toggleChatPinned);
  const toggleProjectPinned = useProjectsStore((state) => state.toggleProjectPinned);
  const archiveProjectSessionMutation = useArchiveProjectSession();
  const {
    draftName,
    handleBlur: handleRenameBlur,
    handleChange: handleRenameChange,
    handleClick: handleRenameClick,
    handleFocus: handleRenameFocus,
    handleKeyDown: handleRenameKeyDown,
    inputRef: renameInputRef,
    renaming,
    startRenaming,
  } = useRenameProject({projectId: project.id, projectName: project.name});
  const sessionsQuery = useListProjectSessions({enabled: expanded, limit: loadedChatLimit, projectPath: project.path});

  const chats =
    sessionsQuery.data?.sessions
      .map((chat) => ({
        id: chat.id,
        pinned: project.pinnedChatIds.includes(chat.id),
        title: chat.title,
        updatedAt: formatUpdatedAt(chat.updatedAt),
      }))
      .toSorted((left, right) => Number(right.pinned) - Number(left.pinned)) ?? [];
  const visibleChats = chats.slice(0, visibleChatLimit);

  const hasChats = chats.length > 0;
  const hasHiddenLoadedChats = chats.length > visibleChatLimit;
  const canShowLessChats = visibleChatLimit > INITIAL_CHAT_LIMIT;
  const canShowMoreChats = hasHiddenLoadedChats || !!sessionsQuery.data?.hasMore;
  const canShowLessAtEnd = canShowLessChats && !canShowMoreChats;
  const canOpenInFinder = window.desktopShell?.platform === "darwin";

  const handleToggle = (): void => {
    onToggle(project.id);
  };

  const handleRemoveProject = (): void => {
    removeProject(project.id);
  };

  const handleToggleProjectPinned = (): void => {
    toggleProjectPinned(project.id);
  };

  const handleToggleChatPinned = (event: MouseEvent<HTMLButtonElement>, chatId: string): void => {
    event.stopPropagation();
    toggleChatPinned(project.id, chatId);
  };

  const handleArchiveChat = (event: MouseEvent<HTMLButtonElement>, chatId: string): void => {
    event.stopPropagation();

    if (confirmingArchiveChatId !== chatId) {
      setConfirmingArchiveChatId(chatId);
      return;
    }

    setConfirmingArchiveChatId(null);
    archiveProjectSessionMutation.mutate({projectPath: project.path, sessionId: chatId});
  };

  const handleChatMouseLeave = (chatId: string): void => {
    if (confirmingArchiveChatId === chatId) setConfirmingArchiveChatId(null);
  };

  const handleOpenInFinder = (): void => {
    void window.desktopShell?.openInFinder(project.path);
  };

  const handleLoadMoreChats = (): void => {
    if (hasHiddenLoadedChats) {
      setVisibleChatLimit(chats.length);
      return;
    }

    setLoadedChatLimit((limit) => limit + CHAT_LIMIT_INCREMENT);
    setVisibleChatLimit((limit) => limit + CHAT_LIMIT_INCREMENT);
  };

  const handleShowLessChats = (): void => {
    setVisibleChatLimit(INITIAL_CHAT_LIMIT);
  };

  return (
    <li>
      <Button
        as="div"
        className={cn("group flex w-full justify-between items-center gap-2 pl-2 pr-1 py-0.5 text-neutral-400 hover:text-neutral-400", actionsMenuOpen && "bg-white/7")}
        onClick={handleToggle}
        variant="primary"
      >
        <div className="flex min-w-0 flex-1 flex-row gap-2 items-center">
          <Icon className="text-neutral-400" name={expanded ? "folder-open" : "folder"} size="xs" />
          {renaming && (
            <input
              className="min-w-0 flex-1 truncate bg-transparent text-sm text-neutral-400 outline-none"
              onBlur={handleRenameBlur}
              onChange={handleRenameChange}
              onClick={handleRenameClick}
              onFocus={handleRenameFocus}
              onKeyDown={handleRenameKeyDown}
              ref={renameInputRef}
              value={draftName}
            />
          )}
          {!renaming && <span className="min-w-0 flex-1 truncate text-sm">{project.name}</span>}
        </div>
        <div className="flex items-center gap-0.5">
          <div className={cn("opacity-0 group-hover:opacity-100", actionsMenuOpen && "opacity-100")}>
            <Menu
              onOpenChange={setActionsMenuOpen}
              open={actionsMenuOpen}
              trigger={(triggerProps) => (
                <Button {...triggerProps} className="size-7" shape="icon" size="md" variant="ghost">
                  <Icon name="more-horizontal" size="xs" />
                </Button>
              )}
              triggerLabel={`Project actions for ${project.name}`}
              sideOffset={2}
            >
              <MenuItem icon={<Icon name="pin" size="xs" />} onClick={handleToggleProjectPinned}>
                {project.pinned ? "Unpin project" : "Pin project"}
              </MenuItem>
              {canOpenInFinder && (
                <MenuItem icon={<Icon name="folder-open" size="xs" />} onClick={handleOpenInFinder}>
                  Open in Finder
                </MenuItem>
              )}
              <MenuItem icon={<Icon name="edit" size="xs" />} onClick={startRenaming}>
                Rename project
              </MenuItem>
              <MenuItem icon={<Icon name="x" size="xs" />} onClick={handleRemoveProject}>
                Remove
              </MenuItem>
            </Menu>
          </div>
          <IconButton className="size-7" label={`New chat in ${project.name}`}>
            <Icon name="edit" size="xs" />
          </IconButton>
        </div>
      </Button>

      <div
        className="grid grid-rows-[0fr] opacity-0 origin-top transition-[grid-template-rows,opacity,transform] duration-320 ease-in-out data-[expanded=true]:grid-rows-[1fr] data-[expanded=true]:opacity-100"
        data-expanded={expanded}
      >
        <div className="overflow-hidden py-0.5">
          {sessionsQuery.isPending && (
            <span className="ml-10 inline-flex items-center justify-start gap-2 px-0 py-1 text-sm text-neutral-600">
              Loading chats
              <span className="size-2.5 animate-spin rounded-full border border-neutral-600 border-t-neutral-300" aria-hidden="true" />
            </span>
          )}
          {sessionsQuery.error != null && <p className="px-8 py-1 text-sm text-red-400">Unable to load chats.</p>}
          {hasChats && (
            <ul className="space-y-0.5">
              {visibleChats.map((chat) => {
                const confirmingArchive = confirmingArchiveChatId === chat.id;

                return (
                  <li key={chat.id} onMouseLeave={() => handleChatMouseLeave(chat.id)}>
                    <Button as="div" className="group/chat flex w-full items-center gap-2 py-1 pl-2 pr-1 text-left text-neutral-200 hover:bg-white/7" variant="primary">
                      <IconButton
                        className={cn("size-6", !chat.pinned && "invisible group-hover/chat:visible")}
                        label={chat.pinned ? "Unpin chat" : "Pin chat"}
                        onClick={(event) => handleToggleChatPinned(event, chat.id)}
                      >
                        <Icon name="pin" size="xs" />
                      </IconButton>
                      <span className="min-w-0 flex-1 truncate text-sm">{chat.title}</span>
                      <span className="grid w-12 shrink-0 place-items-center justify-items-end">
                        <span className="col-start-1 row-start-1 w-full justify-self-end pr-1.5 text-right text-xs text-neutral-600 group-hover/chat:invisible">
                          {chat.updatedAt}
                        </span>
                        <IconButton
                          className={cn(
                            "col-start-1 row-start-1 size-5 disabled:cursor-not-allowed disabled:opacity-50",
                            confirmingArchive ? "rounded-lg bg-red-500/25 text-red-500 hover:bg-red-500/35 hover:text-red-400" : "invisible group-hover/chat:visible"
                          )}
                          disabled={archiveProjectSessionMutation.isPending}
                          label={confirmingArchive ? "Confirm archive chat" : "Archive chat"}
                          onClick={(event) => handleArchiveChat(event, chat.id)}
                        >
                          <Icon name={confirmingArchive ? "x" : "archive"} size="xs" />
                        </IconButton>
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {canShowMoreChats && (
            <Button
              className="ml-10 inline-flex items-center justify-start gap-2 px-0 py-1 text-xs"
              disabled={sessionsQuery.isFetching}
              onClick={handleLoadMoreChats}
              variant="ghost"
            >
              Show more
              {sessionsQuery.isFetching && <span className="size-2.5 animate-spin rounded-full border border-neutral-600 border-t-neutral-300" aria-hidden="true" />}
            </Button>
          )}

          {canShowLessAtEnd && (
            <Button className="ml-10 justify-start px-0 py-1 text-xs" onClick={handleShowLessChats} variant="ghost">
              Show less
            </Button>
          )}

          {!sessionsQuery.isPending && sessionsQuery.error == null && !hasChats && <p className="px-8 py-1 text-sm text-neutral-600">No chats</p>}
        </div>
      </div>
    </li>
  );
}
