import type {ReactNode} from "react";
import type {Hotkey} from "@tanstack/react-hotkeys";
import type {IconName} from "@/components/ui/icon";

/** A page the palette can open on top of its root list, named by the contributing feature; the app maps names to content. */
export type CommandPalettePage = string;

interface CommandPaletteActionBase {
  readonly id: string;
  readonly title: string;
  readonly icon: IconName;
  /** The heading the action is listed under; actions sharing one are listed together, in the order first seen. */
  readonly section: string;
  /** Secondary context after the title, such as the project a new session starts in. */
  readonly detail?: string;
  /** Other words that should find the action. */
  readonly keywords?: readonly string[];
}

/** An entry in the palette's root list: it either opens a palette page or runs once the palette closes. */
export type CommandPaletteAction = CommandPaletteActionBase & ({readonly kind: "page"; readonly page: CommandPalettePage} | {readonly kind: "run"; readonly run: () => void});

/** A session the palette's root list can jump to. */
export interface CommandPaletteSession {
  readonly id: string;
  readonly title: string;
  /** Shown after the title so sessions from different projects can be told apart. */
  readonly projectName: string;
  readonly updatedAt: string;
}

/** Sessions matching a query, a page at a time, as the hosting app provides them. */
export interface CommandPaletteSessionSearch {
  readonly sessions: readonly CommandPaletteSession[];
  readonly isPending: boolean;
  readonly loadMore: () => void;
}

/** A section heading among a palette page's rows. Headings are skipped when moving the highlight. */
export interface CommandPaletteHeaderRow {
  readonly type: "header";
  readonly id: string;
  readonly title: string;
}

/** A key hint in the palette footer: the keys, shown in the platform's notation, and what they do on this page. */
export interface CommandPaletteHint {
  readonly hotkeys: readonly Hotkey[];
  readonly label: string;
}

/** What a palette page renders, usually one `CommandPaletteList`. It calls `onClose` once it is done. */
export type CommandPalettePageRenderer = (props: {readonly onBack: () => void; readonly onClose: () => void}) => ReactNode;
