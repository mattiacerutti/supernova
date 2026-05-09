import type {ButtonHTMLAttributes, KeyboardEvent, MouseEventHandler, ReactNode} from "react";
import {cn} from "@/lib/cn";

export type ButtonVariant = "bare" | "ghost" | "primary";
export type ButtonSize = "lg" | "md" | "none" | "sm";
export type ButtonShape = "default" | "icon";

export interface IButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  as?: "button" | "div";
  children: ReactNode;
  shape?: ButtonShape;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  bare: "cursor-pointer disabled:cursor-default disabled:opacity-50",
  ghost: "cursor-pointer text-neutral-400 hover:text-neutral-100 disabled:cursor-default disabled:opacity-50 disabled:hover:text-neutral-400 [&_svg]:text-current",
  primary:
    "cursor-pointer rounded-xl text-neutral-300 corner-superellipse/1.3 hover:bg-white/7 hover:text-white disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-current",
};

const defaultSizeClasses: Record<ButtonSize, string> = {
  lg: "flex w-full items-center gap-3 px-3 py-2 text-left text-base",
  md: "flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-sm",
  none: "",
  sm: "flex w-full items-center gap-2.5 px-2 py-1.5 text-left text-sm",
};

const iconSizeClasses: Record<ButtonSize, string> = {
  lg: "grid size-10 place-items-center",
  md: "grid size-9 place-items-center",
  none: "",
  sm: "grid size-6 place-items-center",
};

export default function Button(props: IButtonProps) {
  const {as = "button", children, className, onClick, onKeyDown, shape = "default", size = "none", type = "button", variant = "bare", ...buttonProps} = props;
  const resolvedClassName = cn(variantClasses[variant], shape === "icon" ? iconSizeClasses[size] : defaultSizeClasses[size], className);

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
