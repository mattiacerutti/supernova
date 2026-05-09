import type {ComponentProps, KeyboardEvent, MouseEvent, ReactElement, ReactNode} from "react";
import {Menu as BaseMenu} from "@base-ui/react/menu";
import Button from "@/components/ui/button";
import {cn} from "@/lib/cn";

type MenuTriggerProps = Omit<ComponentProps<typeof Button>, "children">;

interface IMenuProps {
  align?: ComponentProps<typeof BaseMenu.Positioner>["align"];
  alignOffset?: ComponentProps<typeof BaseMenu.Positioner>["alignOffset"];
  children: ReactNode;
  className?: string;
  onOpenChange?: ComponentProps<typeof BaseMenu.Root>["onOpenChange"];
  open?: ComponentProps<typeof BaseMenu.Root>["open"];
  side?: ComponentProps<typeof BaseMenu.Positioner>["side"];
  sideOffset?: ComponentProps<typeof BaseMenu.Positioner>["sideOffset"];
  trigger: (triggerProps: MenuTriggerProps) => ReactElement;
  triggerLabel: string;
}

interface IMenuItemProps extends ComponentProps<typeof BaseMenu.Item> {
  icon?: ReactNode;
  trailing?: ReactNode;
}

export default function Menu(props: IMenuProps) {
  const {align = "end", alignOffset, children, className, onOpenChange, open, side = "bottom", sideOffset = 8, trigger, triggerLabel} = props;

  const handleTriggerClick = (event: MouseEvent<HTMLButtonElement>, onClick: MenuTriggerProps["onClick"]): void => {
    event.stopPropagation();
    onClick?.(event);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>, onKeyDown: MenuTriggerProps["onKeyDown"]): void => {
    event.stopPropagation();
    onKeyDown?.(event);
  };

  return (
    <BaseMenu.Root modal={false} onOpenChange={onOpenChange} open={open}>
      <BaseMenu.Trigger
        render={(triggerProps) => {
          const {onClick, onKeyDown, ...buttonProps} = triggerProps as MenuTriggerProps;

          return trigger({
            "aria-label": triggerLabel,
            onClick: (event) => handleTriggerClick(event, onClick),
            onKeyDown: (event) => handleTriggerKeyDown(event, onKeyDown),
            ...buttonProps,
          });
        }}
      />
      <BaseMenu.Portal>
        <BaseMenu.Positioner align={align} alignOffset={alignOffset} className="z-50 outline-none" side={side} sideOffset={sideOffset}>
          <BaseMenu.Popup
            className={cn(
              "min-w-45 rounded-xl border border-white/10 bg-neutral-800/95 p-1 text-neutral-100 shadow-2xl shadow-black/35 backdrop-blur-3xl outline-none",
              "origin-(--transform-origin) translate-y-0 scale-100 opacity-100 transition-[opacity,scale,translate] duration-200 ease-out data-closed:translate-y-1 data-closed:scale-[0.985] data-closed:opacity-0 data-ending-style:translate-y-1 data-ending-style:scale-[0.985] data-ending-style:opacity-0 data-starting-style:translate-y-1 data-starting-style:scale-[0.985] data-starting-style:opacity-0",
              className
            )}
          >
            {children}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

export function MenuItem(props: IMenuItemProps) {
  const {children, className, icon, onClick, trailing, ...itemProps} = props;

  const handleClick: NonNullable<ComponentProps<typeof BaseMenu.Item>["onClick"]> = (event) => {
    event.stopPropagation();
    onClick?.(event);
  };

  return (
    <BaseMenu.Item
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-[0.6rem] px-2 py-1.5 text-left text-sm leading-5 outline-none transition-colors hover:bg-white/8 data-disabled:cursor-default data-disabled:opacity-45 data-highlighted:bg-white/8",
        className
      )}
      onClick={handleClick}
      {...itemProps}
    >
      {icon && <span className="flex h-5 w-3 shrink-0 items-center justify-center text-neutral-300">{icon}</span>}
      <span className="min-w-0 flex-1 truncate leading-5">{children}</span>
      {trailing && <span className="ml-auto flex h-5 shrink-0 items-center justify-center text-neutral-300">{trailing}</span>}
    </BaseMenu.Item>
  );
}
