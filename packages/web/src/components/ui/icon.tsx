import chat from "@iconify-icons/bx/chat";
import editOutline from "@iconify-icons/cuida/edit-outline";
import folderOutline from "@iconify-icons/cuida/folder-outline";
import arrowClockwise16Filled from "@iconify-icons/fluent/arrow-clockwise-16-filled";
import arrowUp16Filled from "@iconify-icons/fluent/arrow-up-16-filled";
import branchFork16Regular from "@iconify-icons/fluent/branch-fork-16-regular";
import folderOpen24Regular from "@iconify-icons/fluent/folder-open-24-regular";
import pin12Regular from "@iconify-icons/fluent/pin-12-regular";
import starSolid from "@iconify-icons/iconoir/star-solid";
import archive from "@iconify-icons/lucide/archive";
import arrowDown from "@iconify-icons/lucide/arrow-down";
import arrowLeft from "@iconify-icons/lucide/arrow-left";
import arrowRight from "@iconify-icons/lucide/arrow-right";
import check from "@iconify-icons/lucide/check";
import chevronDown from "@iconify-icons/lucide/chevron-down";
import chevronRight from "@iconify-icons/lucide/chevron-right";
import circleAlert from "@iconify-icons/lucide/circle-alert";
import codeXml from "@iconify-icons/lucide/code-xml";
import columns2 from "@iconify-icons/lucide/columns-2";
import copy from "@iconify-icons/lucide/copy";
import cornerLeftUp from "@iconify-icons/lucide/corner-left-up";
import file from "@iconify-icons/lucide/file";
import foldVertical from "@iconify-icons/lucide/fold-vertical";
import folderGit2 from "@iconify-icons/lucide/folder-git-2";
import folders from "@iconify-icons/lucide/folders";
import gauge from "@iconify-icons/lucide/gauge";
import gitCommitHorizontal from "@iconify-icons/lucide/git-commit-horizontal";
import globe from "@iconify-icons/lucide/globe";
import image from "@iconify-icons/lucide/image";
import keyRound from "@iconify-icons/lucide/key-round";
import listFilter from "@iconify-icons/lucide/list-filter";
import loaderCircle from "@iconify-icons/lucide/loader-circle";
import maximize2 from "@iconify-icons/lucide/maximize-2";
import minimize2 from "@iconify-icons/lucide/minimize-2";
import monitor from "@iconify-icons/lucide/monitor";
import moon from "@iconify-icons/lucide/moon";
import moreHorizontal from "@iconify-icons/lucide/more-horizontal";
import palette from "@iconify-icons/lucide/palette";
import panelTop from "@iconify-icons/lucide/panel-top";
import paperclip from "@iconify-icons/lucide/paperclip";
import plus from "@iconify-icons/lucide/plus";
import rectangleHorizontal from "@iconify-icons/lucide/rectangle-horizontal";
import redo2 from "@iconify-icons/lucide/redo-2";
import search from "@iconify-icons/lucide/search";
import server from "@iconify-icons/lucide/server";
import settings from "@iconify-icons/lucide/settings";
import shield from "@iconify-icons/lucide/shield";
import squareTerminal from "@iconify-icons/lucide/square-terminal";
import star from "@iconify-icons/lucide/star";
import sun from "@iconify-icons/lucide/sun";
import trash2 from "@iconify-icons/lucide/trash-2";
import triangleAlert from "@iconify-icons/lucide/triangle-alert";
import undo2 from "@iconify-icons/lucide/undo-2";
import unfoldVertical from "@iconify-icons/lucide/unfold-vertical";
import user from "@iconify-icons/lucide/user";
import workflow from "@iconify-icons/lucide/workflow";
import x from "@iconify-icons/lucide/x";
import stopRounded from "@iconify-icons/material-symbols/stop-rounded";
import createNewFolderOutline from "@iconify-icons/mdi/create-new-folder-outline";
import toolLine from "@iconify-icons/mingcute/tool-line";
import checklistLinear from "@iconify-icons/solar/checklist-linear";
import documentAddLinear from "@iconify-icons/solar/document-add-linear";
import documentLinear from "@iconify-icons/solar/document-linear";
import folderWithFilesLinear from "@iconify-icons/solar/folder-with-files-linear";
import globalLinear from "@iconify-icons/solar/global-linear";
import penLinear from "@iconify-icons/solar/pen-linear";
import widgetLinear from "@iconify-icons/solar/widget-linear";
import arrowUpSolid from "@iconify-icons/stash/arrow-up-solid";
import layoutSidebar from "@iconify-icons/tabler/layout-sidebar";
import layoutSidebarRight from "@iconify-icons/tabler/layout-sidebar-right";
import {Icon as IconifyIcon} from "@iconify/react/offline";
import type {IconProps as IconifyIconProps} from "@iconify/react/offline";
import {cn} from "@/lib/cn";

const icons = {
  "alert-triangle": triangleAlert,
  "circle-alert": circleAlert,
  archive,
  "arrow-down": arrowDown,
  "arrow-left": arrowLeft,
  "arrow-right": arrowRight,
  check,
  "chevron-down": chevronDown,
  "chevron-right": chevronRight,
  columns: columns2,
  compact: minimize2,
  code: codeXml,
  copy,
  "corner-left-up": cornerLeftUp,
  edit: editOutline,
  file,
  filter: listFilter,
  "fold-vertical": foldVertical,
  folder: folderOutline,
  "folder-git": folderGit2,
  "folder-open": folderOpen24Regular,
  "folder-plus": createNewFolderOutline,
  folders,
  gauge,
  "git-branch": branchFork16Regular,
  "git-commit": gitCommitHorizontal,
  globe,
  image,
  key: keyRound,
  loader: loaderCircle,
  maximize: maximize2,
  monitor,
  moon,
  "more-horizontal": moreHorizontal,
  "new-session": editOutline,
  "panel-left": layoutSidebar,
  "panel-right": layoutSidebarRight,
  "panel-top": panelTop,
  palette,
  paperclip,
  pin: pin12Regular,
  plus,
  "rectangle-horizontal": rectangleHorizontal,
  redo: redo2,
  restart: arrowClockwise16Filled,
  search,
  send: arrowUpSolid,
  server,
  session: chat,
  settings,
  "tool-command": squareTerminal,
  "tool-edit": penLinear,
  "tool-fetch": globalLinear,
  "tool-find": folderWithFilesLinear,
  "tool-read": documentLinear,
  "tool-todo": checklistLinear,
  "tool-unknown": widgetLinear,
  "tool-write": documentAddLinear,
  shield,
  skill: toolLine,
  star,
  "star-filled": starSolid,
  stop: stopRounded,
  sun,
  terminal: squareTerminal,
  trash: trash2,
  undo: undo2,
  "unfold-vertical": unfoldVertical,
  update: arrowUp16Filled,
  user,
  workflow,
  x,
} as const;

export type IconName = keyof typeof icons;

const sizeClasses: Record<NonNullable<IconProps["size"]>, string> = {
  xs: "size-3.5",
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

interface IconProps extends Omit<IconifyIconProps, "children" | "icon" | "size"> {
  readonly name: IconName;
  readonly size?: "lg" | "md" | "sm" | "xs";
}

export default function Icon(props: IconProps) {
  const {className, name, size = "md", ...iconProps} = props;
  const icon = icons[name];
  const resolvedClassName = cn(sizeClasses[size], "shrink-0", className);

  return <IconifyIcon aria-hidden="true" className={resolvedClassName} icon={icon} ssr {...iconProps} />;
}
