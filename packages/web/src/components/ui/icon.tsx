import {Icon as IconifyIcon} from "@iconify/react";
import type {IconProps as IconifyIconProps} from "@iconify/react";
import {cn} from "@/lib/cn";

type IconName =
  | "archive"
  | "arrow-left"
  | "arrow-right"
  | "check"
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
  | "trash"
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
  edit: "cuida:edit-outline",
  filter: "lucide:list-filter",
  folder: "cuida:folder-outline",
  "folder-open": "fluent:folder-open-24-regular",
  "folder-plus": "mdi:create-new-folder-outline",
  maximize: "lucide:maximize-2",
  "more-horizontal": "lucide:more-horizontal",
  "panel-left": "tabler:layout-sidebar",
  pin: "fluent:pin-12-regular",
  plus: "lucide:plus",
  search: "lucide:search",
  send: "lucide:chevrons-up",
  settings: "lucide:settings",
  trash: "lucide:trash-2",
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
