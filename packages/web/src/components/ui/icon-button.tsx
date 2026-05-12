import type {ReactNode} from "react";
import Button, {type ButtonProps} from "@/components/ui/button";

interface IconButtonProps extends Omit<ButtonProps, "aria-label" | "children"> {
  children: ReactNode;
  label: string;
}

export default function IconButton(props: IconButtonProps) {
  const {children, className, label, shape, size, type = "button", variant, ...buttonProps} = props;

  return (
    <Button aria-label={label} className={className} shape={shape || "icon"} size={size || "md"} type={type} variant={variant || "ghost"} {...buttonProps}>
      {children}
    </Button>
  );
}
