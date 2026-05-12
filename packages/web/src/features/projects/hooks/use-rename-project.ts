import type {ChangeEvent, FocusEvent, KeyboardEvent, MouseEvent} from "react";
import {useRef, useState} from "react";
import {useProjectsStore} from "@/features/projects/stores/projects-store";

interface UseRenameProjectOptions {
  projectId: string;
  projectName: string;
}

export function useRenameProject(options: UseRenameProjectOptions) {
  const {projectId, projectName} = options;

  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(projectName);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const renameProject = useProjectsStore((state) => state.renameProject);

  const startRenaming = (): void => {
    setDraftName(projectName);
    setRenaming(true);
  };

  const saveRename = (): void => {
    renameProject(projectId, draftName);
    setRenaming(false);
  };

  const cancelRename = (): void => {
    setDraftName(projectName);
    setRenaming(false);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setDraftName(event.target.value);
  };

  const handleBlur = (): void => {
    saveRename();
  };

  const handleClick = (event: MouseEvent<HTMLInputElement>): void => {
    event.stopPropagation();
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>): void => {
    event.stopPropagation();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();

    if (event.key === "Enter") {
      event.preventDefault();
      saveRename();
      return;
    }

    if (event.key !== "Escape") return;

    event.preventDefault();
    cancelRename();
  };

  const handleInputRef = (element: HTMLInputElement | null): void => {
    inputRef.current = element;
    if (element && renaming) {
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
    }
  };

  return {
    draftName,
    handleBlur,
    handleChange,
    handleClick,
    handleFocus,
    handleInputRef,
    handleKeyDown,
    renaming,
    startRenaming,
  };
}
