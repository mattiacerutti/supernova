import type {ChangeEvent, FocusEvent, KeyboardEvent, MouseEvent, PointerEvent} from "react";
import {useState} from "react";

interface UseInlineRenameOptions {
  readonly initialValue: string;
  readonly onSave: (value: string) => void;
}

export interface InlineRenameInputProps {
  readonly onBlur: () => void;
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onClick: (event: MouseEvent<HTMLInputElement>) => void;
  readonly onFocus: (event: FocusEvent<HTMLInputElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly onPointerDown: (event: PointerEvent<HTMLInputElement>) => void;
  readonly ref: (element: HTMLInputElement | null) => void;
  readonly value: string;
}

interface UseInlineRenameResult {
  /** Spread onto the rename `<input>`; owns focus, commit, and cancel behavior. */
  readonly inputProps: InlineRenameInputProps;
  readonly renaming: boolean;
  readonly startRenaming: () => void;
}

/** Manages inline rename input state, focus behavior, and commit/cancel keyboard interactions. */
export function useInlineRename(options: UseInlineRenameOptions): UseInlineRenameResult {
  const {initialValue, onSave} = options;

  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(initialValue);

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

  // The input sits inside clickable rows; none of its interactions may reach the row.
  const stopPropagation = (event: FocusEvent<HTMLInputElement> | MouseEvent<HTMLInputElement> | PointerEvent<HTMLInputElement>): void => {
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

  const handleRef = (element: HTMLInputElement | null): void => {
    if (element && renaming) {
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
    }
  };

  return {
    inputProps: {
      onBlur: handleBlur,
      onChange: handleChange,
      onClick: stopPropagation,
      onFocus: stopPropagation,
      onKeyDown: handleKeyDown,
      onPointerDown: stopPropagation,
      ref: handleRef,
      value: draftName,
    },
    renaming,
    startRenaming,
  };
}
