// dashboard/src/components/ui/input.tsx — shadcn `new-york` Input.
//
// Source: https://ui.shadcn.com/docs/components/input (new-york style).
// Pure React + Tailwind — no Radix peer needed. To regenerate:
//   npx shadcn@latest add input --overwrite
//
// Plan 04-07 Task 2 ships this primitive for the DepositWithdrawPanel's
// amount entry field (UI-SPEC §Deposit/Redeem flow step 1 "Input").

import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };
