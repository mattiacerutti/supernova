import {create} from "zustand";
import type {CommandPalettePage} from "@/features/command-palette/types/command-palette";

/** The shortcut that opens and closes the palette from anywhere in the app. */
export const COMMAND_PALETTE_HOTKEY = "Mod+K";

interface CommandPaletteState {
  readonly open: boolean;
  /** Pages opened on top of the root list, innermost last; empty shows the root list. */
  readonly pages: readonly CommandPalettePage[];
  readonly closePalette: () => void;
  /** Opens the palette on its root list, or directly on `page`. */
  readonly openPalette: (page?: CommandPalettePage) => void;
  readonly popPage: () => void;
  readonly pushPage: (page: CommandPalettePage) => void;
  readonly togglePalette: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>()((set) => ({
  open: false,
  pages: [],
  // Pages are left in place on close so the closing animation keeps showing the page the user was on.
  closePalette: () => set({open: false}),
  openPalette: (page) => set({open: true, pages: page ? [page] : []}),
  popPage: () => set((state) => ({pages: state.pages.slice(0, -1)})),
  pushPage: (page) => set((state) => ({pages: [...state.pages, page]})),
  togglePalette: () => set((state) => (state.open ? {open: false} : {open: true, pages: []})),
}));
