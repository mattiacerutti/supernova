import type {ButtonHTMLAttributes, KeyboardEvent, MouseEventHandler, ReactNode} from "react";
import {cn} from "@/lib/cn";

type ButtonVariant = "bare" | "ghost" | "plain";
type ButtonSize = "icon-md" | "icon-sm" | "none" | "row-sm";

interface IButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  as?: "button" | "div";
  children: ReactNode;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  bare: "cursor-pointer",
  ghost: "cursor-pointer rounded-lg hover:bg-white/7 hover:text-white",
  plain: "cursor-pointer text-neutral-400 hover:text-neutral-100 [&_svg]:text-current",
};

const sizeClasses: Record<ButtonSize, string> = {
  "icon-md": "grid size-9 place-items-center",
  "icon-sm": "grid size-6 place-items-center",
  none: "",
  "row-sm": "flex w-full items-center gap-2.5 px-2 py-1.5 text-left text-sm",
};

export default function Button(props: IButtonProps) {
  const {as = "button", children, className, onClick, onKeyDown, size = "none", type = "button", variant = "bare", ...buttonProps} = props;
  const resolvedClassName = cn(variantClasses[variant], sizeClasses[size], className);

  if (as === "div") {
    const handleClick = onClick as unknown as MouseEventHandler<HTMLDivElement> | undefined;

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
      onKeyDown?.(event as unknown as KeyboardEvent<HTMLButtonElement>);

      if (event.defaultPrevented || (event.key !== "Enter" && event.key !== " ")) {
        return;
      }

      event.preventDefault();
      event.currentTarget.click();
    };

    return (
      <div className={resolvedClassName} onClick={handleClick} onKeyDown={handleKeyDown} role="button" tabIndex={0}>
        {children}
      </div>
    );
  }

  return (
    <button className={resolvedClassName} onClick={onClick} onKeyDown={onKeyDown} type={type} {...buttonProps}>
      {children}
    </button>
  );
}
