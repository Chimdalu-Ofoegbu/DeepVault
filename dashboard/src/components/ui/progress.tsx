// dashboard/src/components/ui/progress.tsx — shadcn `new-york` Progress.
//
// Source: https://ui.shadcn.com/docs/components/progress (new-york style).
// Verbatim wrapper around @radix-ui/react-progress. To regenerate:
//   npx shadcn@latest add progress --overwrite
//
// Plan 04-05 ships this primitive because UI-SPEC §Design System enumerates it
// in the Phase 4 shadcn component inventory. VaultPanel itself uses Recharts
// RadialBarChart for the utilization gauge (richer color escalation); Progress
// is here for any downstream linear-progress need (loading bars, slider tracks,
// etc.) without re-running shadcn CLI.

import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';

import { cn } from '@/lib/utils';

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      'relative h-2 w-full overflow-hidden rounded-full bg-slate-800',
      className,
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-cyan-500 transition-all"
      style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
