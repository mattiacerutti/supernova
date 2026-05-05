import type {InputHTMLAttributes} from "react";
import {cn} from "@/lib/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export default function Input(props: InputProps) {
  const {className, ...inputProps} = props;

  return (
    <input
      className={cn(
        "w-full rounded-xl border border-white/10 bg-neutral-800/70 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-white/20",
        className
      )}
      {...inputProps}
    />
  );
}
