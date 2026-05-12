// dashboard/src/lib/utils.ts — shadcn-standard class-name merge helper.
//
// `cn(...inputs)` resolves Tailwind class-conflict precedence (later classes
// win) and supports clsx-style conditional class objects/arrays. This is the
// canonical helper shadcn-new-york templates import as `cn` from `@/lib/utils`.

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
