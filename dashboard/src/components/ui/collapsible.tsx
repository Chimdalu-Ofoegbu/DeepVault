// dashboard/src/components/ui/collapsible.tsx — shadcn `new-york` Collapsible.
//
// Source: https://ui.shadcn.com/docs/components/collapsible (new-york style).
// Verbatim re-export wrapper around @radix-ui/react-collapsible. To regenerate:
//   npx shadcn@latest add collapsible --overwrite

import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';

const Collapsible = CollapsiblePrimitive.Root;

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;

const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent;

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
