import {Fragment, useRef} from "react";
import {CommandPaletteFocus} from "@/features/command-palette/components/command-palette-list";
import {useHotkey} from "@tanstack/react-hotkeys";
import Dialog from "@/components/ui/dialog";
import CommandPaletteRootPage from "@/features/command-palette/components/command-palette-root-page";
import {COMMAND_PALETTE_HOTKEY, useCommandPaletteStore} from "@/features/command-palette/stores/command-palette-store";
import type {
  CommandPaletteAction,
  CommandPalettePage,
  CommandPalettePageRenderer,
  CommandPaletteSession,
  CommandPaletteSessionSearch,
} from "@/features/command-palette/types/command-palette";

interface CommandPaletteProps {
  readonly actions: readonly CommandPaletteAction[];
  readonly onOpenSession: (session: CommandPaletteSession) => void;
  readonly pages: Readonly<Record<CommandPalettePage, CommandPalettePageRenderer>>;
  readonly useSessionSearch: (query: string) => CommandPaletteSessionSearch;
}

export default function CommandPalette(props: CommandPaletteProps) {
  const {actions, onOpenSession, pages, useSessionSearch} = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement>(null);
  const popupRef = useRef<Element>(null);

  const open = useCommandPaletteStore((state) => state.open);
  const pageStack = useCommandPaletteStore((state) => state.pages);
  const closePalette = useCommandPaletteStore((state) => state.closePalette);
  const popPage = useCommandPaletteStore((state) => state.popPage);
  const togglePalette = useCommandPaletteStore((state) => state.togglePalette);

  const page = pageStack.at(-1);

  // Fires from text inputs too, so the palette toggles from the composer; a focused terminal keeps the keys.
  useHotkey(COMMAND_PALETTE_HOTKEY, togglePalette);

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) closePalette();
  };

  const handleInitialFocus = (): HTMLInputElement | null => {
    const active = document.activeElement;
    returnFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    popupRef.current = inputRef.current?.closest('[role="dialog"]') ?? null;
    return inputRef.current;
  };

  const handleFinalFocus = (): HTMLElement | false => {
    // A selected action may already have focused its destination outside the palette.
    const active = document.activeElement;
    if (active !== document.body && !popupRef.current?.contains(active)) return false;
    return returnFocusRef.current?.isConnected ? returnFocusRef.current : false;
  };

  return (
    <Dialog hideHeader initialFocus={handleInitialFocus} finalFocus={handleFinalFocus} onOpenChange={handleOpenChange} open={open} title="Command palette">
      <CommandPaletteFocus inputRef={inputRef}>
        {/* Keyed by depth so each page starts with a fresh query and highlight, including the root when going back. */}
        <Fragment key={pageStack.length}>
          {page === undefined ? (
            <CommandPaletteRootPage actions={actions} onOpenSession={onOpenSession} useSessionSearch={useSessionSearch} />
          ) : (
            pages[page]?.({onBack: popPage, onClose: closePalette})
          )}
        </Fragment>
      </CommandPaletteFocus>
    </Dialog>
  );
}
