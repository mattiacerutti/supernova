import type {InputHTMLAttributes} from "react";
import {cn} from "@/lib/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export default function Input(props: InputProps) {
  const {className, ...inputProps} = props;

  return (
    <input
      className={cn(
        "w-full rounded-xl border border-border bg-surface-raised/70 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-border-strong",
        className
      )}
      {...inputProps}
    />
  );
}
