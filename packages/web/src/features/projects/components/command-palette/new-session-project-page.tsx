import {useState} from "react";
import {useNavigate} from "@tanstack/react-router";
import {matchSorter} from "match-sorter";
import CommandPaletteItem from "@/features/command-palette/components/command-palette-item";
import CommandPaletteList from "@/features/command-palette/components/command-palette-list";
import {useProjectsStore} from "@/features/projects/stores/projects-store";
import type {Project} from "@/features/projects/types/project";

interface NewSessionProjectPageProps {
  readonly onBack: () => void;
  /** Called once a project is chosen, before navigating to its new session. */
  readonly onClose: () => void;
}

/** The palette page that picks the project a new session starts in. */
export default function NewSessionProjectPage(props: NewSessionProjectPageProps) {
  const {onBack, onClose} = props;
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const projects = useProjectsStore((state) => state.projects);
  const trimmedQuery = query.trim();
  const matchedProjects = trimmedQuery.length === 0 ? projects : matchSorter(projects, trimmedQuery, {keys: ["name", "path"]});

  const handleSelect = (project: Project): void => {
    onClose();
    void navigate({search: {projectId: project.id}, to: "/session/new"});
  };

  return (
    <CommandPaletteList
      getRowKey={(project: Project) => project.id}
      hints={[{hotkeys: ["Enter"], label: "Start session"}]}
      onBack={onBack}
      onQueryChange={setQuery}
      onSelect={handleSelect}
      placeholder="New session in…"
      query={query}
      renderRow={(project, itemState) => (
        <CommandPaletteItem {...itemState} detail={project.path} icon="folder">
          {project.name}
        </CommandPaletteItem>
      )}
      rows={matchedProjects}
      status={matchedProjects.length === 0 && <p className="px-3 py-2 text-sm text-ink-faint">No matching projects.</p>}
    />
  );
}
