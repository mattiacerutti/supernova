import type {ButtonHTMLAttributes, ReactNode} from "react";
import Button from "@/components/ui/button";

interface IIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  label: string;
}

export default function IconButton(props: IIconButtonProps) {
  const {children, className, label, type = "button", ...buttonProps} = props;

  return (
    <Button aria-label={label} className={className} size="icon-md" type={type} variant="plain" {...buttonProps}>
      {children}
    </Button>
  );
}
