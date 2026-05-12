// dashboard/src/components/ui/badge.tsx — shadcn `new-york` Badge.
//
// Source: https://ui.shadcn.com/docs/components/badge (new-york style).
// Verbatim template + an `amber` variant ADDED in Plan 04-06 for the
// WhatIfSimulator bootstrap-fallback and synthetic-forward Badges (STRIDE
// T-04-06-04 + T-04-06-05 mitigations). The amber class string matches
// UI-SPEC §Color status semantics amber-500 #f59e0b. To regenerate the
// other variants, run `npx shadcn@latest add badge --overwrite` and then
// re-apply the `amber` variant below.

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
        amber:
          'border border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/20',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
