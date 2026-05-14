import {Icon as IconifyIcon} from "@iconify/react";
import type {IconProps as IconifyIconProps} from "@iconify/react";

import {cn} from "@/lib/cn";

export type IconName =
  | "archive"
  | "arrow-down"
  | "arrow-left"
  | "arrow-right"
  | "check"
  | "chevron-down"
  | "chevron-right"
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
  | "search"
  | "send"
  | "server"
  | "settings"
  | "shield"
  | "star"
  | "star-filled"
  | "stop"
  | "sun"
  | "trash"
  | "user"
  | "workflow"
  | "x";

interface IconProps extends Omit<IconifyIconProps, "children" | "icon" | "size"> {
  name: IconName;
  size?: "lg" | "md" | "sm" | "xs";
}

const icons: Record<IconName, string> = {
  archive: "lucide:archive",
  "arrow-down": "lucide:arrow-down",
  "arrow-left": "lucide:arrow-left",
  "arrow-right": "lucide:arrow-right",
  check: "lucide:check",
  "chevron-down": "lucide:chevron-down",
  "chevron-right": "lucide:chevron-right",
  copy: "lucide:copy",
  edit: "cuida:edit-outline",
  file: "lucide:file",
  filter: "lucide:list-filter",
  folder: "cuida:folder-outline",
  "folder-open": "fluent:folder-open-24-regular",
  "folder-plus": "mdi:create-new-folder-outline",
  gauge: "lucide:gauge",
  "git-branch": "lucide:git-branch",
  image: "lucide:image",
  key: "lucide:key-round",
  loader: "lucide:loader-circle",
  maximize: "lucide:maximize-2",
  "more-horizontal": "lucide:more-horizontal",
  "new-session": "cuida:edit-outline",
  "panel-left": "tabler:layout-sidebar",
  "panel-top": "lucide:panel-top",
  paperclip: "lucide:paperclip",
  pin: "fluent:pin-12-regular",
  plus: "lucide:plus",
  "rectangle-horizontal": "lucide:rectangle-horizontal",
  search: "lucide:search",
  send: "stash:arrow-up-solid",
  server: "lucide:server",
  settings: "lucide:settings",
  shield: "lucide:shield",
  star: "lucide:star",
  "star-filled": "iconoir:star-solid",
  stop: "material-symbols:stop-rounded",
  sun: "lucide:sun",
  trash: "lucide:trash-2",
  user: "lucide:user",
  workflow: "lucide:workflow",
  x: "lucide:x",
};

const sizeClasses: Record<NonNullable<IconProps["size"]>, string> = {
  xs: "size-3.5",
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

export default function Icon(props: IconProps) {
  const {className, name, size = "md", ...iconProps} = props;
  const icon = icons[name];
  const resolvedClassName = cn(sizeClasses[size], "shrink-0", className);

  return <IconifyIcon aria-hidden="true" className={resolvedClassName} icon={icon} ssr {...iconProps} />;
}
