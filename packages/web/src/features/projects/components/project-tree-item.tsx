import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import type {IProjectTreeProject} from "@/features/projects/types/project-tree";
import {formatUpdatedAt} from "@/features/projects/utils/format-updated-at";
import {useListProjectSessions} from "@/features/projects/hooks/api/use-list-project-sessions";
import {useProjectsStore} from "@/features/projects/stores/projects-store";

interface IProjectTreeItemProps {
  expanded: boolean;
  project: IProjectTreeProject;
  onToggle: (projectId: string) => void;
}

export default function ProjectTreeItem(props: IProjectTreeItemProps) {
  const {expanded, onToggle, project} = props;

  const removeProject = useProjectsStore((state) => state.removeProject);
  const sessionsQuery = useListProjectSessions({enabled: expanded, projectPath: project.path});

  const chats =
    sessionsQuery.data?.sessions.map((chat) => ({
      id: chat.id,
      title: chat.title,
      updatedAt: formatUpdatedAt(chat.updatedAt),
    })) ?? project.chats;

  const hasChats = chats.length > 0;

  const handleToggle = (): void => {
    onToggle(project.id);
  };

  // TODO: Temporary to test deleting projects until we develop tooltip/menu actions.
  const handleTemporaryDeleteProject = (): void => {
    removeProject(project.id);
  };

  return (
    <li>
      <Button as="div" className="group flex w-full justify-between items-center gap-2 px-2 py-0.5 text-neutral-400 hover:bg-white/7" onClick={handleToggle} variant="ghost">
        <div className="flex flex-row gap-2 items-center ">
          <Icon className="text-neutral-400" name={expanded ? "folder-open" : "folder"} size="sm" />
          <span className="min-w-0 flex-1 truncate text-sm">{project.name}</span>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
          <IconButton className="size-7" label={`Delete ${project.name}`} onClick={handleTemporaryDeleteProject}>
            <Icon name="more-horizontal" size="sm" />
          </IconButton>
          <IconButton className="size-7" label={`New chat in ${project.name}`}>
            <Icon name="edit" size="sm" />
          </IconButton>
        </div>
      </Button>

      <div className="sidebar-collapse" data-expanded={expanded}>
        <div className="overflow-hidden py-0.5">
          {sessionsQuery.isLoading && <p className="px-8 py-1 text-sm text-neutral-600">Loading chats...</p>}
          {sessionsQuery.error && <p className="px-8 py-1 text-sm text-red-400">Unable to load chats.</p>}
          {hasChats && (
            <ul className="space-y-0.5">
              {chats.map((chat) => (
                <li key={chat.id}>
                  <Button as="div" className="group/chat flex w-full items-center gap-2 py-1 pl-2 pr-1 text-left text-neutral-200 hover:bg-white/7" variant="ghost">
                    <IconButton className="invisible size-6 group-hover/chat:visible" label="Pin chat">
                      <Icon name="pin" size="sm" />
                    </IconButton>
                    <span className="min-w-0 flex-1 truncate text-sm">{chat.title}</span>
                    <span className="grid w-12 shrink-0 place-items-center justify-items-end">
                      <span className="col-start-1 row-start-1 w-full justify-self-end pr-1.5 text-right text-xs text-neutral-600 group-hover/chat:invisible">
                        {chat.updatedAt}
                      </span>
                      <IconButton className="invisible col-start-1 row-start-1 size-6 group-hover/chat:visible" label="Archive chat">
                        <Icon name="trash" size="sm" />
                      </IconButton>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {!sessionsQuery.isLoading && !sessionsQuery.error && !hasChats && <p className="px-8 py-1 text-sm text-neutral-600">No chats</p>}
        </div>
      </div>
    </li>
  );
}
