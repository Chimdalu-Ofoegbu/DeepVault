// dashboard/src/components/primitives/TxDigestLink.tsx — Sui tx digest
// renderer with copy-on-click + Sui Explorer external link.
//
// UI-SPEC §Component Inventory: truncated `0x1234…abcd` with copy-on-click
// Tooltip. Network defaults to testnet; mainnet variant follows the same
// suiscan.xyz URL scheme.
//
// Phase 04.1 reskin (UI-SPEC #12): recolor-only — the explorer link moves
// from the Phase-4 cyan Tailwind to the handoff mint `--accent`; the muted
// copy-button slate moves to the `--muted`/`--text-2` OKLCH tokens. Logic
// (clipboard copy, tooltip) is UNCHANGED.

import { useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { truncateDigest } from '@/lib/format';

type Props = {
  digest: string;
  network?: 'testnet' | 'mainnet';
};

export function TxDigestLink({ digest, network = 'testnet' }: Props) {
  const [copied, setCopied] = useState(false);
  const url = `https://suiscan.xyz/${network}/tx/${digest}`;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(digest);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (older browsers / permissions) — fall
      // through; user can still right-click → copy via the visible link.
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 font-mono text-xs">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              {truncateDigest(digest)} <ExternalLink className="inline h-3 w-3" />
            </a>
            <button
              type="button"
              aria-label="Copy digest"
              onClick={onCopy}
              className="transition-colors"
              style={{ color: 'var(--muted)' }}
            >
              <Copy className="h-3 w-3" />
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{copied ? 'Copied!' : digest}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
