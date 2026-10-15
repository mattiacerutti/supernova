import {Fragment} from "react";
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

  return (
    <Dialog hideHeader onOpenChange={handleOpenChange} open={open} title="Command palette">
      {/* Keyed by depth so each page starts with a fresh query and highlight, including the root when going back. */}
      <Fragment key={pageStack.length}>
        {page === undefined ? (
          <CommandPaletteRootPage actions={actions} onOpenSession={onOpenSession} useSessionSearch={useSessionSearch} />
        ) : (
          pages[page]?.({onBack: popPage, onClose: closePalette})
        )}
      </Fragment>
    </Dialog>
  );
}
