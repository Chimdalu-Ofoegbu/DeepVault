// dashboard/src/components/primitives/NumericValue.tsx — monospace tabular-nums
// wrapper for any numeric display.
//
// UI-SPEC §Typography: JetBrains Mono with `font-feature-settings: "tnum"` for
// column alignment in stat blocks + tables. Apply via the `font-mono tabular-
// nums` Tailwind utility chain (Tailwind ships tabular-nums as a built-in
// font-feature-settings variant since 3.x).

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type Props = {
  children: ReactNode;
  className?: string;
};

export function NumericValue({ children, className }: Props) {
  return (
    <span className={cn('font-mono tabular-nums', className)}>{children}</span>
  );
}
