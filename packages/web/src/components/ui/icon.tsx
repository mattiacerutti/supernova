import {
  ArrowLeft,
  ArrowRight,
  ChevronsUp,
  ChevronDown,
  Edit3,
  Folder,
  FolderOpen,
  FolderPlus,
  ListFilter,
  Maximize2,
  MoreHorizontal,
  PanelLeft,
  Pin,
  Plus,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import type {LucideIcon, LucideProps} from "lucide-react";
import {cn} from "@/lib/cn";

type IconName =
  | "arrow-left"
  | "arrow-right"
  | "chevron-down"
  | "edit"
  | "filter"
  | "folder"
  | "folder-open"
  | "folder-plus"
  | "maximize"
  | "more-horizontal"
  | "panel-left"
  | "pin"
  | "plus"
  | "search"
  | "send"
  | "settings"
  | "trash";

interface IIconProps extends Omit<LucideProps, "children"> {
  name: IconName;
  size?: "sm" | "md" | "lg";
}

const icons: Record<IconName, LucideIcon> = {
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "chevron-down": ChevronDown,
  edit: Edit3,
  filter: ListFilter,
  folder: Folder,
  "folder-open": FolderOpen,
  "folder-plus": FolderPlus,
  maximize: Maximize2,
  "more-horizontal": MoreHorizontal,
  "panel-left": PanelLeft,
  pin: Pin,
  plus: Plus,
  search: Search,
  send: ChevronsUp,
  settings: Settings,
  trash: Trash2,
};

const sizeClasses: Record<NonNullable<IIconProps["size"]>, string> = {
  sm: "size-3.5",
  md: "size-4.5",
  lg: "size-5.5",
};

export default function Icon(props: IIconProps) {
  const {className, name, size = "md", strokeWidth = 1.8, ...iconProps} = props;
  const LucideIconComponent = icons[name];

  return <LucideIconComponent aria-hidden="true" className={cn(sizeClasses[size], "shrink-0", className)} strokeWidth={strokeWidth} {...iconProps} />;
}
