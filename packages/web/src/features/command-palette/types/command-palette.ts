import type {ReactNode} from "react";
import type {Hotkey} from "@tanstack/react-hotkeys";
import type {IconName} from "@/components/ui/icon";

export type CommandPalettePage = string;

interface CommandPaletteActionBase {
  readonly id: string;
  readonly title: string;
  readonly icon: IconName;
  readonly section: string;
  readonly detail?: string;
  readonly keywords?: readonly string[];
}

export type CommandPaletteAction = CommandPaletteActionBase & ({readonly kind: "page"; readonly page: CommandPalettePage} | {readonly kind: "run"; readonly run: () => void});

export interface CommandPaletteSession {
  readonly id: string;
  readonly title: string;
  readonly projectName: string;
  readonly updatedAt: string;
}

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

export interface CommandPaletteHint {
  readonly hotkeys: readonly Hotkey[];
  readonly label: string;
}

export type CommandPalettePageRenderer = (props: {readonly onBack: () => void; readonly onClose: () => void}) => ReactNode;
