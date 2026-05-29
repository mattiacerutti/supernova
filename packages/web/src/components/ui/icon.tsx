import {icons as cuidaIcons} from "@iconify-json/cuida";
import {icons as fluentIcons} from "@iconify-json/fluent";
import {icons as iconoirIcons} from "@iconify-json/iconoir";
import {icons as lucideIcons} from "@iconify-json/lucide";
import {icons as materialSymbolsIcons} from "@iconify-json/material-symbols";
import {icons as mdiIcons} from "@iconify-json/mdi";
import {icons as mingcuteIcons} from "@iconify-json/mingcute";
import {icons as stashIcons} from "@iconify-json/stash";
import {icons as tablerIcons} from "@iconify-json/tabler";
import {Icon as IconifyIcon} from "@iconify/react/offline";
import type {IconProps as IconifyIconProps} from "@iconify/react/offline";
import {getIconData} from "@iconify/utils";

import {cn} from "@/lib/cn";

export type IconName =
  | "archive"
  | "arrow-down"
  | "arrow-left"
  | "arrow-right"
  | "check"
  | "chevron-down"
  | "chevron-right"
  | "compact"
  | "copy"
  | "edit"
  | "file"
  | "filter"
  | "folder"
  | "folder-open"
  | "folder-plus"
  | "gauge"
  | "git-branch"
  | "key"
  | "image"
  | "loader"
  | "maximize"
  | "more-horizontal"
  | "new-session"
  | "panel-left"
  | "panel-top"
  | "paperclip"
  | "pin"
  | "plus"
  | "rectangle-horizontal"
  | "redo"
  | "search"
  | "send"
  | "server"
  | "settings"
  | "shield"
  | "skill"
  | "star"
  | "star-filled"
  | "stop"
  | "sun"
  | "trash"
  | "undo"
  | "user"
  | "workflow"
  | "x";

function getStaticIcon(collection: Parameters<typeof getIconData>[0], name: string): IconifyIconProps["icon"] {
  const icon = getIconData(collection, name);

  if (!icon) throw new Error(`Missing static icon data for ${collection.prefix}:${name}`);

  return icon;
}

const icons = {
  archive: getStaticIcon(lucideIcons, "archive"),
  "arrow-down": getStaticIcon(lucideIcons, "arrow-down"),
  "arrow-left": getStaticIcon(lucideIcons, "arrow-left"),
  "arrow-right": getStaticIcon(lucideIcons, "arrow-right"),
  check: getStaticIcon(lucideIcons, "check"),
  "chevron-down": getStaticIcon(lucideIcons, "chevron-down"),
  "chevron-right": getStaticIcon(lucideIcons, "chevron-right"),
  compact: getStaticIcon(lucideIcons, "minimize-2"),
  copy: getStaticIcon(lucideIcons, "copy"),
  edit: getStaticIcon(cuidaIcons, "edit-outline"),
  file: getStaticIcon(lucideIcons, "file"),
  filter: getStaticIcon(lucideIcons, "list-filter"),
  folder: getStaticIcon(cuidaIcons, "folder-outline"),
  "folder-open": getStaticIcon(fluentIcons, "folder-open-24-regular"),
  "folder-plus": getStaticIcon(mdiIcons, "create-new-folder-outline"),
  gauge: getStaticIcon(lucideIcons, "gauge"),
  "git-branch": getStaticIcon(lucideIcons, "git-branch"),
  image: getStaticIcon(lucideIcons, "image"),
  key: getStaticIcon(lucideIcons, "key-round"),
  loader: getStaticIcon(lucideIcons, "loader-circle"),
  maximize: getStaticIcon(lucideIcons, "maximize-2"),
  "more-horizontal": getStaticIcon(lucideIcons, "more-horizontal"),
  "new-session": getStaticIcon(cuidaIcons, "edit-outline"),
  "panel-left": getStaticIcon(tablerIcons, "layout-sidebar"),
  "panel-top": getStaticIcon(lucideIcons, "panel-top"),
  paperclip: getStaticIcon(lucideIcons, "paperclip"),
  pin: getStaticIcon(fluentIcons, "pin-12-regular"),
  plus: getStaticIcon(lucideIcons, "plus"),
  "rectangle-horizontal": getStaticIcon(lucideIcons, "rectangle-horizontal"),
  redo: getStaticIcon(lucideIcons, "redo-2"),
  search: getStaticIcon(lucideIcons, "search"),
  send: getStaticIcon(stashIcons, "arrow-up-solid"),
  server: getStaticIcon(lucideIcons, "server"),
  settings: getStaticIcon(lucideIcons, "settings"),
  shield: getStaticIcon(lucideIcons, "shield"),
  skill: getStaticIcon(mingcuteIcons, "tool-line"),
  star: getStaticIcon(lucideIcons, "star"),
  "star-filled": getStaticIcon(iconoirIcons, "star-solid"),
  stop: getStaticIcon(materialSymbolsIcons, "stop-rounded"),
  sun: getStaticIcon(lucideIcons, "sun"),
  trash: getStaticIcon(lucideIcons, "trash-2"),
  undo: getStaticIcon(lucideIcons, "undo-2"),
  user: getStaticIcon(lucideIcons, "user"),
  workflow: getStaticIcon(lucideIcons, "workflow"),
  x: getStaticIcon(lucideIcons, "x"),
} satisfies Record<IconName, IconifyIconProps["icon"]>;

const sizeClasses: Record<NonNullable<IconProps["size"]>, string> = {
  xs: "size-3.5",
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

interface IconProps extends Omit<IconifyIconProps, "children" | "icon" | "size"> {
  name: IconName;
  size?: "lg" | "md" | "sm" | "xs";
}

export default function Icon(props: IconProps) {
  const {className, name, size = "md", ...iconProps} = props;
  const icon = icons[name];
  const resolvedClassName = cn(sizeClasses[size], "shrink-0", className);

  return <IconifyIcon aria-hidden="true" className={resolvedClassName} icon={icon} ssr {...iconProps} />;
}
