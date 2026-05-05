import {Icon as IconifyIcon} from "@iconify/react";
import type {IconProps as IconifyIconProps} from "@iconify/react";
import {cn} from "@/lib/cn";

export type IconName =
  | "archive"
  | "arrow-left"
  | "arrow-right"
  | "check"
  | "chevron-down"
  | "copy"
  | "edit"
  | "filter"
  | "folder"
  | "folder-open"
  | "folder-plus"
  | "gauge"
  | "git-branch"
  | "key"
  | "loader"
  | "maximize"
  | "more-horizontal"
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
  | "sun"
  | "trash"
  | "user"
  | "workflow"
  | "x";

interface IIconProps extends Omit<IconifyIconProps, "children" | "icon" | "size"> {
  name: IconName;
  size?: "lg" | "md" | "sm" | "xs";
}

const icons: Record<IconName, string> = {
  archive: "lucide:archive",
  "arrow-left": "lucide:arrow-left",
  "arrow-right": "lucide:arrow-right",
  check: "lucide:check",
  "chevron-down": "lucide:chevron-down",
  copy: "lucide:copy",
  edit: "cuida:edit-outline",
  filter: "lucide:list-filter",
  folder: "cuida:folder-outline",
  "folder-open": "fluent:folder-open-24-regular",
  "folder-plus": "mdi:create-new-folder-outline",
  gauge: "lucide:gauge",
  "git-branch": "lucide:git-branch",
  key: "lucide:key-round",
  loader: "lucide:loader-circle",
  maximize: "lucide:maximize-2",
  "more-horizontal": "lucide:more-horizontal",
  "panel-left": "tabler:layout-sidebar",
  "panel-top": "lucide:panel-top",
  paperclip: "lucide:paperclip",
  pin: "fluent:pin-12-regular",
  plus: "lucide:plus",
  "rectangle-horizontal": "lucide:rectangle-horizontal",
  search: "lucide:search",
  send: "lucide:chevrons-up",
  server: "lucide:server",
  settings: "lucide:settings",
  shield: "lucide:shield",
  sun: "lucide:sun",
  trash: "lucide:trash-2",
  user: "lucide:user",
  workflow: "lucide:workflow",
  x: "lucide:x",
};

const sizeClasses: Record<NonNullable<IIconProps["size"]>, string> = {
  xs: "size-3.5",
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

export default function Icon(props: IIconProps) {
  const {className, name, size = "md", ...iconProps} = props;
  const icon = icons[name];
  const resolvedClassName = cn(sizeClasses[size], "shrink-0", className);

  return <IconifyIcon aria-hidden="true" className={resolvedClassName} icon={icon} {...iconProps} />;
}
