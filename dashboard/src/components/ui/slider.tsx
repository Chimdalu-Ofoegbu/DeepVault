// dashboard/src/components/ui/slider.tsx — shadcn `new-york` Slider.
//
// Source: https://ui.shadcn.com/docs/components/slider (new-york style).
// Verbatim wrapper around @radix-ui/react-slider. To regenerate:
//   npx shadcn@latest add slider --overwrite
//
// Plan 04-06 ships this primitive for the WhatIfSimulator (DASH-09) — the
// two-slider joint spot+vol shock panel.

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

import { cn } from '@/lib/utils';

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      'relative flex w-full touch-none select-none items-center',
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-slate-800">
      <SliderPrimitive.Range className="absolute h-full bg-cyan-500" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border border-cyan-500 bg-slate-950 ring-offset-slate-950 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
