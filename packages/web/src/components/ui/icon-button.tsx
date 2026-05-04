import type {ButtonHTMLAttributes, ReactNode} from "react";
import Button, {type ButtonSize, type ButtonVariant} from "@/components/ui/button";

interface IIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  label: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

export default function IconButton(props: IIconButtonProps) {
  const {children, className, label, type = "button", size, variant, ...buttonProps} = props;

  return (
    <Button aria-label={label} className={className} size={size || "icon-md"} type={type} variant={variant || "plain"} {...buttonProps}>
      {children}
    </Button>
  );
}
