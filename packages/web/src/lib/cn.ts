import {clsx} from "clsx";
import type {ClassValue} from "clsx";
import {extendTailwindMerge} from "tailwind-merge";

const twMerge = extendTailwindMerge({extend: {theme: {text: ["code"]}}});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
