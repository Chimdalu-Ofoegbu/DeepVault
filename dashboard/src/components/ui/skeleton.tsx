// dashboard/src/components/ui/skeleton.tsx — shadcn `new-york` Skeleton.
//
// Source: https://ui.shadcn.com/docs/components/skeleton (new-york style).
// Verbatim template; do not hand-edit. To regenerate, run:
//   npx shadcn@latest add skeleton --overwrite

import { cn } from '@/lib/utils';

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };
