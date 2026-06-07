import type {ChangeEvent, FocusEvent, KeyboardEvent, MouseEvent} from "react";
import {useRef, useState} from "react";

interface UseInlineRenameOptions {
  readonly initialValue: string;
  readonly onSave: (value: string) => void;
}

/** Manages inline rename input state, focus behavior, and commit/cancel keyboard interactions. */
export function useInlineRename(options: UseInlineRenameOptions) {
  const {initialValue, onSave} = options;

  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const startRenaming = (): void => {
    setDraftName(initialValue);
    setRenaming(true);
  };

  const saveRename = (): void => {
    const trimmedName = draftName.trim();
    setRenaming(false);
    if (trimmedName.length === 0 || trimmedName === initialValue) return;
    onSave(trimmedName);
  };

  const cancelRename = (): void => {
    setDraftName(initialValue);
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
