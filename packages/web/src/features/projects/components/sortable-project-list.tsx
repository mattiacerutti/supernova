import type {MouseEvent} from "react";
import {useRef, useState} from "react";
import {createPortal} from "react-dom";
import type {DragEndEvent, DragStartEvent} from "@dnd-kit/core";
import {closestCenter, DndContext, DragOverlay, MeasuringStrategy, PointerSensor, useSensor, useSensors} from "@dnd-kit/core";
import {restrictToParentElement, restrictToVerticalAxis} from "@dnd-kit/modifiers";
import {SortableContext, useSortable, verticalListSortingStrategy} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import ProjectListItem from "@/features/projects/components/project-list-item";
import {useProjectsStore} from "@/features/projects/stores/projects-store";
import type {ProjectListProject} from "@/features/projects/types/project-list";
import {cn} from "@/lib/cn";

const dragModifiers = [restrictToVerticalAxis, restrictToParentElement];
const dragMeasuring = {droppable: {strategy: MeasuringStrategy.Always}};

interface SortableProjectItemProps {
  activeSessionId: string;
  expanded: boolean;
  project: ProjectListProject;
  onToggle: (projectId: string) => void;
}

function SortableProjectItem(props: SortableProjectItemProps) {
  const {activeSessionId, expanded, onToggle, project} = props;
  const {isDragging, listeners, setNodeRef, transform, transition} = useSortable({id: project.id});

  return (
    <li className={cn(isDragging && "opacity-0")} ref={setNodeRef} style={{transform: CSS.Translate.toString(transform), transition}} {...listeners}>
      <ProjectListItem activeSessionId={activeSessionId} dragging={isDragging} expanded={expanded && !isDragging} onToggle={onToggle} project={project} />
    </li>
  );
}

interface SortableProjectListProps {
  activeSessionId: string;
  className?: string;
  expandedProjectIds: Set<string>;
  projects: ProjectListProject[];
  onToggleProject: (projectId: string) => void;
}

/** Project list where items can be drag-reordered within their own section. */
export default function SortableProjectList(props: SortableProjectListProps) {
  const {activeSessionId, className, expandedProjectIds, onToggleProject, projects} = props;

  const reorderProject = useProjectsStore((state) => state.reorderProject);
  const suppressClickRef = useRef(false);
  const [activeProject, setActiveProject] = useState<ProjectListProject | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 6}}));

  const handleDragStart = (event: DragStartEvent): void => {
    setActiveProject(projects.find((project) => project.id === event.active.id) ?? null);
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    setActiveProject(null);

    // The click fired on release would toggle the project; swallow it.
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);

    const {active, over} = event;
    if (over && active.id !== over.id) {
      reorderProject(String(active.id), String(over.id));
    }
  };

  const handleDragCancel = (): void => {
    setActiveProject(null);
  };

  const handleClickCapture = (event: MouseEvent<HTMLUListElement>): void => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <DndContext
      collisionDetection={closestCenter}
      measuring={dragMeasuring}
      modifiers={dragModifiers}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <SortableContext items={projects.map((project) => project.id)} strategy={verticalListSortingStrategy}>
        <ul className={className} onClickCapture={handleClickCapture}>
          {projects.map((project) => (
            <SortableProjectItem activeSessionId={activeSessionId} expanded={expandedProjectIds.has(project.id)} key={project.id} onToggle={onToggleProject} project={project} />
          ))}
        </ul>
      </SortableContext>
      {createPortal(
        <DragOverlay>
          {activeProject && (
            <div className="rounded-xl corner-superellipse/1.3 bg-surface-raised">
              <ProjectListItem activeSessionId={activeSessionId} dragging expanded={false} onToggle={onToggleProject} project={activeProject} />
            </div>
          )}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
}
